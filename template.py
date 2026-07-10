#!/usr/bin/env python3
"""
Infinite Hybrid Matrix World
============================
Python standard library only.

Combines two ideas:
1. Reversible, path-independent chunk addressing over F_p:
       C(cx, cy) = A^cx * S * B^cy  (mod p)
2. Stateless coordinate generation using every 61-bit limb of arbitrary-size
   Python integer coordinates, followed by smooth multi-scale value noise.

Properties:
- No world border: Python integers allow arbitrary-size coordinates.
- Returning to a coordinate reconstructs the same terrain.
- Chunk and random-value LRU caches are bounded, so RAM does not grow with
  travel distance.
- Adjacent chunk states are derived by A, A^-1, B, B^-1 when possible;
  matrix exponentiation is only the fallback for a cache miss/teleport.
- No third-party libraries.

The finite field and finite output alphabet still imply collisions are
mathematically unavoidable. The full-coordinate fold prevents the simple
periodicity that would arise from using only C(cx,cy) modulo p.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Sequence
import os

P = (1 << 61) - 1
CHUNK_SIZE = 16
VIEW_W = 41
VIEW_H = 21
MAX_CHUNK_STATES = 128
MAX_RANDOM_VALUES = 32768

SEED = (
    (1, 3),
    (2, 4),
)

C1 = 0x9E3779B97F4A7C15 % P
C2 = 0xBF58476D1CE4E5B9 % P
C3 = 0x94D049BB133111EB % P
C4 = 0xD6E8FEB86659FD93 % P

Matrix = tuple[tuple[int, ...], ...]
Vector = tuple[int, ...]


def mod_nonzero(value: int) -> int:
    value %= P
    return value if value else 1


def normalize_matrix(matrix: Sequence[Sequence[int]]) -> Matrix:
    rows = tuple(tuple(int(value) % P for value in row) for row in matrix)
    n = len(rows)
    if n < 2 or any(len(row) != n for row in rows):
        raise ValueError("Seed must be a square n x n matrix with n >= 2")
    return rows


def identity(n: int) -> Matrix:
    return tuple(
        tuple(1 if i == j else 0 for j in range(n))
        for i in range(n)
    )


def mat_mul(a: Matrix, b: Matrix) -> Matrix:
    rows = len(a)
    inner = len(b)
    cols = len(b[0])
    if len(a[0]) != inner:
        raise ValueError("Incompatible matrix dimensions")

    out = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        for k in range(inner):
            aik = a[i][k]
            if aik == 0:
                continue
            for j in range(cols):
                out[i][j] = (out[i][j] + aik * b[k][j]) % P
    return tuple(tuple(row) for row in out)


def mat_inv(matrix: Matrix) -> Matrix:
    """Gauss-Jordan inverse over the prime field F_p."""
    n = len(matrix)
    aug = [
        list(matrix[i]) + [1 if i == j else 0 for j in range(n)]
        for i in range(n)
    ]

    for col in range(n):
        pivot = next((r for r in range(col, n) if aug[r][col] % P), None)
        if pivot is None:
            raise ValueError("Matrix is singular modulo P")

        aug[col], aug[pivot] = aug[pivot], aug[col]
        inverse_pivot = pow(aug[col][col] % P, P - 2, P)
        aug[col] = [(value * inverse_pivot) % P for value in aug[col]]

        for row in range(n):
            if row == col:
                continue
            factor = aug[row][col] % P
            if factor:
                aug[row] = [
                    (aug[row][j] - factor * aug[col][j]) % P
                    for j in range(2 * n)
                ]

    return tuple(tuple(row[n:]) for row in aug)


def mat_pow(base: Matrix, exponent: int) -> Matrix:
    """Integer matrix power, including negative exponents."""
    if exponent < 0:
        base = mat_inv(base)
        exponent = -exponent

    result = identity(len(base))
    while exponent:
        if exponent & 1:
            result = mat_mul(result, base)
        base = mat_mul(base, base)
        exponent >>= 1
    return result


def elementary(n: int, row: int, col: int, amount: int) -> Matrix:
    data = [list(r) for r in identity(n)]
    data[row][col] = amount % P
    return tuple(tuple(r) for r in data)


def derive_axis_matrices(seed: Matrix) -> tuple[Matrix, Matrix]:
    """Derive guaranteed-invertible movement matrices from every seed entry."""
    n = len(seed)
    diag_a = [list(row) for row in identity(n)]
    diag_b = [list(row) for row in identity(n)]

    for i in range(n):
        diag_a[i][i] = mod_nonzero(seed[i][i] + 2 * i + 3)
        diag_b[i][i] = mod_nonzero(seed[i][i] + 3 * i + 5)

    a: Matrix = tuple(tuple(row) for row in diag_a)
    b: Matrix = tuple(tuple(row) for row in diag_b)

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            amount_a = (
                seed[i][j]
                + (i + 1) * 0x9E3779B1
                + (j + 1) * 0x85EBCA77
            ) % P
            amount_b = (
                seed[j][i]
                + (i + 1) * 0xC2B2AE3D
                + (j + 1) * 0x27D4EB2F
            ) % P
            a = mat_mul(elementary(n, i, j, amount_a), a)
            b = mat_mul(b, elementary(n, i, j, amount_b))

    return a, b


def rows_to_columns(matrix: Matrix) -> tuple[Vector, ...]:
    return tuple(tuple(column) for column in zip(*matrix))


def apply_transform(v: Sequence[int], u: Sequence[int]) -> Vector:
    """
    Reversible n-dimensional extension of the user's recurrence.

    For v=(a_1,...,a_(n-1),t), u=(u_1,...,u_n):
        w_1 = t*u_1 - sum(a_j*u_(j+1))
        w_i = t*u_i - a_(i-1)*w_1,  i=2..n

    For n=2:
        x_next = x_old*y_now - x_now*y_old
        y_next = y_old*y_now - x_now*x_next

    t=0 is deterministically represented by t=1 so the mixer remains
    invertible for all internal states.
    """
    if len(v) != len(u) or len(v) < 2:
        raise ValueError("Vectors must have equal dimension >= 2")

    n = len(v)
    t = mod_nonzero(v[-1])
    w0 = (t * u[0] - sum(v[j] * u[j + 1] for j in range(n - 1))) % P
    return (w0,) + tuple(
        (t * u[i] - v[i - 1] * w0) % P
        for i in range(1, n)
    )


def invert_transform(v: Sequence[int], w: Sequence[int]) -> Vector:
    """Recover u from w = T_n(v)u."""
    if len(v) != len(w) or len(v) < 2:
        raise ValueError("Vectors must have equal dimension >= 2")

    n = len(v)
    t = mod_nonzero(v[-1])
    inv_t = pow(t, P - 2, P)
    u = [0] * n

    for i in range(1, n):
        u[i] = ((w[i] + v[i - 1] * w[0]) * inv_t) % P
    u[0] = (
        (w[0] + sum(v[j] * u[j + 1] for j in range(n - 1))) * inv_t
    ) % P
    return tuple(u)


def recurrence_round(columns: tuple[Vector, ...]) -> tuple[Vector, ...]:
    new_vector = apply_transform(columns[-1], columns[0])
    return columns[1:] + (new_vector,)


def zigzag(value: int) -> int:
    """Biject signed integers Z to non-negative integers N."""
    return value * 2 if value >= 0 else -2 * value - 1


def mix61(value: int) -> int:
    value %= P
    value ^= value >> 30
    value = (value * C2) % P
    value ^= value >> 27
    value = (value * C3) % P
    value ^= value >> 31
    return value % P


def fold_bigint(value: int, salt: int) -> int:
    """Mix every 61-bit limb of an arbitrary-size coordinate into F_p."""
    value = zigzag(value)
    h = mix61(salt + C1)
    counter = 1
    while True:
        limb = value & P
        value >>= 61
        h = mix61(h + limb + counter * C4)
        counter += 1
        if value == 0:
            return h


def flatten(matrix: Matrix) -> tuple[int, ...]:
    return tuple(value for row in matrix for value in row)


class HybridMatrixWorld:
    def __init__(self, seed: Sequence[Sequence[int]]) -> None:
        self.seed = normalize_matrix(seed)
        self.n = len(self.seed)
        self.a, self.b = derive_axis_matrices(self.seed)
        self.a_inv = mat_inv(self.a)
        self.b_inv = mat_inv(self.b)

        self.chunk_cache: OrderedDict[tuple[int, int], Matrix] = OrderedDict()
        self.random_cache: OrderedDict[
            tuple[tuple[int, ...], int, int, int], int
        ] = OrderedDict()
        self._remember_chunk(0, 0, self.seed)

    def _remember_chunk(self, cx: int, cy: int, state: Matrix) -> Matrix:
        key = (cx, cy)
        self.chunk_cache[key] = state
        self.chunk_cache.move_to_end(key)
        while len(self.chunk_cache) > MAX_CHUNK_STATES:
            self.chunk_cache.popitem(last=False)
        return state

    def chunk_state(self, cx: int, cy: int) -> Matrix:
        """
        Return C(cx,cy)=A^cx*S*B^cy.

        Prefer O(n^3) reversible neighbor updates. Use O(n^3 log |coord|)
        exponentiation only when no adjacent cached state exists.
        """
        key = (cx, cy)
        cached = self.chunk_cache.get(key)
        if cached is not None:
            self.chunk_cache.move_to_end(key)
            return cached

        west = self.chunk_cache.get((cx - 1, cy))
        if west is not None:
            return self._remember_chunk(cx, cy, mat_mul(self.a, west))

        east = self.chunk_cache.get((cx + 1, cy))
        if east is not None:
            return self._remember_chunk(cx, cy, mat_mul(self.a_inv, east))

        north = self.chunk_cache.get((cx, cy - 1))
        if north is not None:
            return self._remember_chunk(cx, cy, mat_mul(north, self.b))

        south = self.chunk_cache.get((cx, cy + 1))
        if south is not None:
            return self._remember_chunk(cx, cy, mat_mul(south, self.b_inv))

        state = mat_mul(mat_mul(mat_pow(self.a, cx),
                        self.seed), mat_pow(self.b, cy))
        return self._remember_chunk(cx, cy, state)

    def _mixed_value(
        self,
        state_flat: tuple[int, ...],
        hx: int,
        hy: int,
        salt: int,
    ) -> int:
        key = (state_flat, hx, hy, salt)
        cached = self.random_cache.get(key)
        if cached is not None:
            self.random_cache.move_to_end(key)
            return cached

        state = tuple(
            tuple(state_flat[i * self.n:(i + 1) * self.n])
            for i in range(self.n)
        )
        columns = rows_to_columns(state)

        # Coordinate injection before reversible recurrence rounds.
        injected = []
        for i, column in enumerate(columns):
            injected.append(tuple(
                (
                    value
                    + (i + 1) * hx
                    + (j + 1) * hy
                    + (i + 1) * (j + 1) * salt
                    + hx * hy
                ) % P
                for j, value in enumerate(column)
            ))
        columns = tuple(injected)

        rounds = 2 * self.n + 8
        accumulator = mix61(hx + 3 * hy + 5 * salt + C1)
        for r in range(rounds):
            columns = recurrence_round(columns)
            accumulator = mix61(
                accumulator
                + columns[-1][r % self.n]
                + (r + 1) * C4
            )

        for column in columns:
            for value in column:
                accumulator = mix61(accumulator + value + C2)

        result = mix61(accumulator + hx * C3 + hy * C4 + salt)
        self.random_cache[key] = result
        self.random_cache.move_to_end(key)
        while len(self.random_cache) > MAX_RANDOM_VALUES:
            self.random_cache.popitem(last=False)
        return result

    def random_at(self, x: int, y: int, salt: int) -> int:
        """Path-independent stateless random value for an arbitrary coordinate."""
        cx, _ = divmod(x, CHUNK_SIZE)
        cy, _ = divmod(y, CHUNK_SIZE)
        state = self.chunk_state(cx, cy)

        # Fold all coordinate limbs. This prevents terrain from inheriting the
        # simple finite periods of A^cx and B^cy alone.
        hx = fold_bigint(x, salt ^ C2)
        hy = fold_bigint(y, salt ^ C3)
        return self._mixed_value(flatten(state), hx, hy, salt % P)

    def unit_random(self, x: int, y: int, salt: int) -> float:
        return self.random_at(x, y, salt) / P

    @staticmethod
    def smoothstep(t: float) -> float:
        return t * t * (3.0 - 2.0 * t)

    @staticmethod
    def lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    def value_noise(self, x: int, y: int, scale: int, salt: int) -> float:
        gx, rx = divmod(x, scale)
        gy, ry = divmod(y, scale)
        tx = self.smoothstep(rx / scale)
        ty = self.smoothstep(ry / scale)

        n00 = self.unit_random(gx, gy, salt)
        n10 = self.unit_random(gx + 1, gy, salt)
        n01 = self.unit_random(gx, gy + 1, salt)
        n11 = self.unit_random(gx + 1, gy + 1, salt)

        top = self.lerp(n00, n10, tx)
        bottom = self.lerp(n01, n11, tx)
        return self.lerp(top, bottom, ty)

    def tile_at(self, x: int, y: int) -> str:
        height = (
            0.52 * self.value_noise(x, y, 96, 0xA11CE)
            + 0.30 * self.value_noise(x, y, 37, 0xBEEF1)
            + 0.18 * self.value_noise(x, y, 13, 0xC0FFEE)
        )
        moisture = (
            0.72 * self.value_noise(x, y, 71, 0x12345678)
            + 0.28 * self.value_noise(x, y, 19, 0x87654321)
        )
        detail = self.unit_random(x, y, 0xDE7A11)

        if height < 0.29:
            return "~"   # water
        if height > 0.80:
            return "^"   # mountain
        if moisture > 0.67 and detail < 0.42:
            return "T"   # forest
        if detail < 0.012:
            return "*"   # flower
        if detail < 0.19:
            return ","   # soil
        return "."       # grass

    def walkable(self, x: int, y: int) -> bool:
        return self.tile_at(x, y) not in {"~", "^"}

    def clear_caches(self) -> None:
        self.chunk_cache.clear()
        self.random_cache.clear()
        self._remember_chunk(0, 0, self.seed)


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def find_spawn(world: HybridMatrixWorld) -> tuple[int, int]:
    for radius in range(128):
        for y in range(-radius, radius + 1):
            for x in range(-radius, radius + 1):
                if max(abs(x), abs(y)) != radius:
                    continue
                if world.walkable(x, y):
                    return x, y
    return 0, 0


def render(world: HybridMatrixWorld, player_x: int, player_y: int) -> None:
    clear_screen()
    half_w = VIEW_W // 2
    half_h = VIEW_H // 2

    for dy in range(-half_h, half_h + 1):
        line = []
        for dx in range(-half_w, half_w + 1):
            x = player_x + dx
            y = player_y + dy
            line.append("@" if dx == 0 and dy == 0 else world.tile_at(x, y))
        print("".join(line))

    pcx, pcy = player_x // CHUNK_SIZE, player_y // CHUNK_SIZE
    print(
        f"\nPosition: ({player_x}, {player_y}) | chunk: ({pcx}, {pcy})"
        f" | matrix: {world.n}x{world.n}"
    )
    print(
        f"Caches: chunks {len(world.chunk_cache)}/{MAX_CHUNK_STATES}, "
        f"random {len(world.random_cache)}/{MAX_RANDOM_VALUES} | p={P}"
    )
    print("W/A/S/D + Enter: move | G x y: teleport | C: clear cache | Q: quit")
    print("Legend: ~ water, ^ mountain, T tree, * flower, . grass, , soil")


def self_test() -> None:
    # Exact n=2 recurrence supplied by the user.
    v_old = (1, 2)
    v_now = (3, 4)
    v_next = apply_transform(v_now, v_old)
    assert v_next == (P - 2, 14)
    assert invert_transform(v_now, v_next) == v_old

    world = HybridMatrixWorld(SEED)

    # Path independence: east then south == south then east.
    east_then_south = mat_mul(mat_mul(world.a, world.seed), world.b)
    south_then_east = mat_mul(world.a, mat_mul(world.seed, world.b))
    assert east_then_south == south_then_east

    # Neighbor updates agree with direct powers in all four directions.
    expected_east = mat_mul(world.a, world.seed)
    expected_west = mat_mul(world.a_inv, world.seed)
    expected_south = mat_mul(world.seed, world.b)
    expected_north = mat_mul(world.seed, world.b_inv)
    assert world.chunk_state(1, 0) == expected_east
    assert world.chunk_state(-1, 0) == expected_west
    assert world.chunk_state(0, 1) == expected_south
    assert world.chunk_state(0, -1) == expected_north

    # Direct random access and regeneration at huge coordinates.
    points = [
        (0, 0),
        (-17, 31),
        (10**80 + 123, -(10**75) + 7),
    ]
    before = [world.tile_at(x, y) for x, y in points]
    world.clear_caches()
    after = [world.tile_at(x, y) for x, y in points]
    assert before == after

    # Cache bounds remain fixed.
    for i in range(MAX_CHUNK_STATES + 20):
        world.chunk_state(i * 1000, -i * 977)
    assert len(world.chunk_cache) <= MAX_CHUNK_STATES


def main() -> None:
    self_test()
    world = HybridMatrixWorld(SEED)
    player_x, player_y = find_spawn(world)

    while True:
        render(world, player_x, player_y)
        command = input("> ").strip().lower()

        if command == "q":
            break
        if command == "c":
            world.clear_caches()
            continue

        directions = {
            "w": (0, -1),
            "s": (0, 1),
            "a": (-1, 0),
            "d": (1, 0),
        }
        if command in directions:
            dx, dy = directions[command]
            nx, ny = player_x + dx, player_y + dy
            if world.walkable(nx, ny):
                player_x, player_y = nx, ny
            continue

        if command.startswith("g "):
            parts = command.split()
            if len(parts) == 3:
                try:
                    player_x = int(parts[1])
                    player_y = int(parts[2])
                except ValueError:
                    input("Coordinates must be integers. Press Enter...")


if __name__ == "__main__":
    main()
