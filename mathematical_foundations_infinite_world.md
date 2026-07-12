# Nền tảng toán học của Infinite Hybrid Matrix World

> Tài liệu này mô tả kiến trúc toán học đang có trong source `Inf-Game`, giải thích vì sao nó có thể tạo một thế giới có miền tọa độ không giới hạn, tái tạo chính xác theo seed và chỉ dùng bộ nhớ hữu hạn. Phần cuối là bản đánh giá trung thực cùng các hướng cải tiến có thể thử nghiệm.

---

## 1. “Bản đồ vô hạn” trong dự án này thực sự có nghĩa là gì?

Trong toán học, không thể ánh xạ vô hạn tọa độ vào một tập trạng thái hữu hạn mà mọi tọa độ đều cho kết quả khác nhau. Vì vậy cần tách bốn khái niệm:

1. **Miền địa chỉ không giới hạn**: tọa độ thế giới thuộc \(\mathbb Z^2\), được lưu bằng `BigInt`, nên không có biên cố định như số nguyên 32 bit.
2. **Tái tạo xác định**: cùng seed, cùng phiên bản thuật toán và cùng tọa độ luôn sinh lại cùng nội dung.
3. **Bộ nhớ hữu hạn**: chỉ giữ một số chunk gần người chơi bằng LRU cache; chunk bị xóa có thể sinh lại.
4. **Không đảm bảo duy nhất tuyệt đối**: do trạng thái và đầu ra cuối cùng đều hữu hạn, va chạm là không thể tránh khỏi về mặt toán học.

Kiến trúc hiện tại đạt ba mục đầu. Mục thứ tư là giới hạn lý thuyết, không phải lỗi triển khai.

Có thể viết ngắn gọn:

\[
\text{unbounded addressing} \neq \text{infinitely many unique outputs}.
\]

Trong ngữ cảnh game, “vô hạn” nghĩa là người chơi có thể tiếp tục đi hoặc teleport đến tọa độ nguyên tùy ý, còn nội dung được dựng lại theo hàm xác định mà không phải lưu toàn bộ thế giới.

---

## 2. Tổng quan kiến trúc toán học hiện tại

Luồng sinh dữ liệu có thể tóm tắt như sau:

```text
Seed ma trận S
    ↓
Suy ra hai ma trận khả nghịch A và B trên trường F_p
    ↓
Trạng thái chunk C(cx, cy) = A^cx · S · B^cy mod p
    ↓
Fold toàn bộ tọa độ BigInt x, y thành hx, hy ∈ F_p
    ↓
Trộn C(cx,cy), hx, hy và salt bằng recurrence khả nghịch + mixer
    ↓
Sinh giá trị giả ngẫu nhiên xác định tại tọa độ
    ↓
Value noise nhiều tỉ lệ
    ↓
Height, moisture, biome, cây, đá, hoa
    ↓
BufferGeometry + InstancedMesh để render
```

Các file chính:

- `src/game/constants.ts`: \(p\), kích thước chunk, salts và seed mặc định.
- `src/game/world/fieldMath.ts`: số học modulo \(p\).
- `src/game/world/matrix.ts`: nhân, nghịch đảo, lũy thừa và suy ra \(A,B\).
- `src/game/world/recurrence.ts`: phép biến đổi vector khả nghịch.
- `src/game/world/coordinateHash.ts`: Zigzag, fold từng limb và mixer.
- `src/game/world/hybridWorld.ts`: trạng thái chunk và random tại tọa độ.
- `src/game/world/noise.ts`: height, moisture và biome.
- `src/game/world/chunkGenerator.ts`: dữ liệu logic và hình học của chunk.

---

# PHẦN I — TRƯỜNG HỮU HẠN VÀ SỐ HỌC MODULO

## 3. Trường hữu hạn \(\mathbb F_p\)

Dự án dùng:

\[
p = 2^{61}-1 = 2305843009213693951.
\]

Đây là một số nguyên tố Mersenne. Mọi phần tử của trường là một số trong:

\[
\mathbb F_p=\{0,1,2,\ldots,p-1\}.
\]

Mọi phép cộng và nhân đều lấy modulo \(p\):

\[
a+b \pmod p,\qquad ab\pmod p.
\]

Ví dụ:

\[
(p-2)+5\equiv 3\pmod p.
\]

### 3.1. Vì sao phải dùng số nguyên tố?

Khi \(p\) nguyên tố, mọi phần tử khác 0 đều có nghịch đảo:

\[
\forall a\neq0,\quad \exists a^{-1}: aa^{-1}\equiv1\pmod p.
\]

Theo định lý Fermat nhỏ:

\[
a^{p-1}\equiv1\pmod p,
\]

nên:

\[
a^{-1}\equiv a^{p-2}\pmod p.
\]

Trong source, `modInv()` dùng đúng công thức này. Nghịch đảo vô hướng là nền tảng để Gauss–Jordan tìm nghịch đảo ma trận.

### 3.2. Vì sao chọn 61 bit?

Lựa chọn này có vài ưu điểm:

- đủ lớn để không gian trạng thái rất rộng;
- vẫn gọn hơn 64 bit;
- phù hợp chia tọa độ `BigInt` thành các limb 61 bit;
- số học được thực hiện chính xác bằng `BigInt`;
- không phụ thuộc giới hạn \(2^{53}-1\) của JavaScript `number`.

Tuy nhiên, chọn \(p\) lớn **không tự động** tạo ra phân bố tốt hoặc chu kỳ cực đại. Chất lượng còn phụ thuộc vào:

- bậc của ma trận \(A,B\);
- mixer tọa độ;
- entropy thật của seed;
- hàm noise và biome.

---

## 4. Chuẩn hóa modulo và số âm

JavaScript trả phần dư có thể âm, nên source dùng:

\[
\operatorname{mod}(x)=((x\bmod p)+p)\bmod p.
\]

Ví dụ:

\[
-1\equiv p-1\pmod p.
\]

Đây là điều bắt buộc để mọi phép toán luôn nằm trong đại diện chuẩn \([0,p-1]\).

---

# PHẦN II — MA TRẬN VÀ ĐỊA CHỈ CHUNK

## 5. Seed ma trận

Seed được biểu diễn bởi một ma trận vuông:

\[
S\in M_n(\mathbb F_p),\qquad n\ge2.
\]

Seed mặc định hiện tại là:

\[
S=\begin{pmatrix}1&3\\2&4\end{pmatrix}.
\]

Định thức:

\[
\det(S)=1\cdot4-3\cdot2=-2\not\equiv0\pmod p,
\]

nên seed mặc định khả nghịch.

Source không bắt buộc mọi seed phải khả nghịch. Một seed suy biến vẫn chạy được, nhưng có thể làm quỹ đạo trạng thái nhỏ hơn hoặc xuất hiện nhiều đối xứng hơn. Nếu mục tiêu là tối đa hóa độ đa dạng, nên ưu tiên:

\[
\det(S)\not\equiv0\pmod p.
\]

### 5.1. Số lượng seed lý thuyết

Với ma trận \(n\times n\), số ma trận có thể có là:

\[
p^{n^2}.
\]

Với \(n=2\):

\[
p^4\approx2^{244}.
\]

Đây là không gian lý thuyết rất lớn. Nhưng entropy thực tế chỉ bằng lượng thông tin người dùng nhập. Một seed đơn giản như bốn số nhỏ không có 244 bit entropy.

---

## 6. Suy ra hai ma trận chuyển động \(A\) và \(B\)

Dự án tạo hai ma trận:

\[
A,B\in GL(n,p),
\]

trong đó \(GL(n,p)\) là nhóm các ma trận khả nghịch trên \(\mathbb F_p\).

`deriveAxisMatrices()` xây chúng từ:

1. Ma trận đường chéo có mọi phần tử đường chéo khác 0.
2. Các ma trận sơ cấp kiểu shear:

\[
E_{ij}(a)=I+a\,e_ie_j^T,\qquad i\ne j.
\]

Với \(i\ne j\):

\[
\det(E_{ij}(a))=1,
\]

và:

\[
E_{ij}(a)^{-1}=E_{ij}(-a).
\]

Ma trận đường chéo có các phần tử đường chéo khác 0 cũng khả nghịch. Tích của các ma trận khả nghịch vẫn khả nghịch, vì vậy \(A\) và \(B\) được đảm bảo khả nghịch.

Đây là một điểm thiết kế tốt: mọi bước đi theo bốn hướng đều có thể đảo ngược.

---

## 7. Công thức trạng thái chunk

Trạng thái tại chunk \((c_x,c_y)\in\mathbb Z^2\) là:

\[
\boxed{C(c_x,c_y)=A^{c_x}SB^{c_y}\pmod p.}
\]

Số mũ có thể âm vì \(A,B\) khả nghịch:

\[
A^{-k}=(A^{-1})^k,\qquad B^{-k}=(B^{-1})^k.
\]

### 7.1. Di chuyển sang chunk lân cận

Từ công thức trên:

\[
C(c_x+1,c_y)=A\,C(c_x,c_y),
\]

\[
C(c_x-1,c_y)=A^{-1}C(c_x,c_y),
\]

\[
C(c_x,c_y+1)=C(c_x,c_y)B,
\]

\[
C(c_x,c_y-1)=C(c_x,c_y)B^{-1}.
\]

Do đó:

- đi sang chunk liền kề chỉ cần một phép nhân ma trận;
- teleport đến chunk xa dùng lũy thừa nhị phân;
- không cần duyệt qua mọi chunk trung gian.

### 7.2. Độ phức tạp

Với ma trận \(n\times n\):

- nhân ma trận: \(O(n^3)\);
- lũy thừa ma trận: \(O(n^3\log |c|)\);
- cập nhật chunk lân cận từ cache: \(O(n^3)\).

Với \(n=2\), chi phí ma trận khá nhỏ. Tăng \(n\) sẽ mở rộng trạng thái nhưng chi phí tăng theo bậc ba.

---

## 8. Tính độc lập đường đi

Đây là tính chất cốt lõi của kiến trúc.

Định nghĩa hai toán tử:

\[
L_A(X)=AX,\qquad R_B(X)=XB.
\]

Ta có:

\[
L_A(R_B(X))=A(XB)=(AX)B=R_B(L_A(X)).
\]

Vì phép nhân ma trận có tính kết hợp, hai **toán tử trái/phải** này giao hoán với nhau.

Điều quan trọng:

> Không cần \(AB=BA\). Thứ giao hoán là hành động nhân bên trái bởi \(A\) và hành động nhân bên phải bởi \(B\).

Ví dụ đi Đông rồi Nam:

\[
S\xrightarrow{E}AS\xrightarrow{S}ASB.
\]

Đi Nam rồi Đông:

\[
S\xrightarrow{S}SB\xrightarrow{E}A(SB)=ASB.
\]

Vì vậy mọi đường đi có cùng tổng dịch chuyển đều kết thúc tại cùng trạng thái chunk.

---

## 9. Chu kỳ của trạng thái chunk

Vì \(GL(n,p)\) là nhóm hữu hạn, mọi ma trận khả nghịch đều có bậc hữu hạn.

Gọi:

\[
r_A=\operatorname{ord}(A),\qquad r_B=\operatorname{ord}(B).
\]

Khi đó:

\[
A^{r_A}=I,\qquad B^{r_B}=I.
\]

Suy ra:

\[
C(c_x+r_A,c_y)=C(c_x,c_y),
\]

\[
C(c_x,c_y+r_B)=C(c_x,c_y).
\]

Nói cách khác, **lớp trạng thái ma trận tự nó luôn có chu kỳ hữu hạn**.

Kích thước nhóm:

\[
|GL(n,p)|=(p^n-1)(p^n-p)\cdots(p^n-p^{n-1}),
\]

và theo định lý Lagrange:

\[
\operatorname{ord}(A)\mid |GL(n,p)|.
\]

Nhưng cách hiện tại suy ra \(A,B\) chỉ đảm bảo khả nghịch, chưa đảm bảo bậc lớn. Một ma trận hoàn toàn có thể có bậc nhỏ hơn rất nhiều so với cận trên.

### 9.1. Điều kiện va chạm hai chiều

Nếu \(S\) khả nghịch và:

\[
C(x_1,y_1)=C(x_2,y_2),
\]

thì với \(\Delta x=x_1-x_2\), \(\Delta y=y_1-y_2\):

\[
A^{\Delta x}S B^{\Delta y}=S,
\]

hay:

\[
A^{\Delta x}=S B^{-\Delta y}S^{-1}.
\]

Do đó kích thước quỹ đạo hai chiều phụ thuộc vào giao của hai nhóm cyclic:

\[
\langle A\rangle\cap S\langle B\rangle S^{-1}.
\]

Muốn quỹ đạo lớn, cần:

- \(A,B\) có bậc lớn;
- giao ở trên càng nhỏ càng tốt;
- \(S\) không suy biến.

Đây là một hướng cải tiến toán học quan trọng hơn việc chỉ tăng \(p\).

---

# PHẦN III — RECURRENCE KHẢ NGHỊCH

## 10. Phép biến đổi vector

Với hai vector:

\[
v=(v_0,v_1,\ldots,v_{n-1}),
\]

\[
u=(u_0,u_1,\ldots,u_{n-1}),
\]

đặt:

\[
t=\operatorname{modNonZero}(v_{n-1}).
\]

Source tính:

\[
w_0=t u_0-\sum_{j=0}^{n-2}v_j u_{j+1}\pmod p,
\]

và với \(i=1,\ldots,n-1\):

\[
w_i=t u_i-v_{i-1}w_0\pmod p.
\]

Ta ký hiệu:

\[
w=T_v(u).
\]

### 10.1. Trường hợp \(n=2\)

Đặt:

\[
v=(x_{now},y_{now}),\qquad u=(x_{old},y_{old}).
\]

Khi đó:

\[
x_{next}=y_{now}x_{old}-x_{now}y_{old},
\]

\[
y_{next}=y_{now}y_{old}-x_{now}x_{next}.
\]

Đây là recurrence gốc được mở rộng lên số chiều \(n\).

---

## 11. Vì sao recurrence đảo ngược được?

Từ:

\[
w_i=t u_i-v_{i-1}w_0,
\]

suy ra:

\[
u_i=(w_i+v_{i-1}w_0)t^{-1},\qquad i\ge1.
\]

Sau đó:

\[
u_0=\left(w_0+\sum_{j=0}^{n-2}v_j u_{j+1}\right)t^{-1}.
\]

Vì \(t\ne0\), \(t^{-1}\) tồn tại trong \(\mathbb F_p\). Do đó với \(v\) cố định, \(T_v\) là một phép biến đổi khả nghịch.

`recurrenceRound()` dịch các cột sang trái rồi tạo cột mới từ cột cuối và cột đầu. Toàn bộ vòng cũng khả nghịch vì:

- các cột cũ từ 1 đến \(n-1\) vẫn được giữ;
- cột cũ đầu tiên có thể phục hồi bằng `invertTransform()`.

### 11.1. Vai trò trong kiến trúc

Recurrence được dùng như một lớp khuếch tán nội bộ:

- trộn các cột của trạng thái chunk;
- đưa ảnh hưởng của \(h_x,h_y\) và salt lan ra nhiều phần tử;
- giữ khả năng đảo ngược ở từng round, tránh làm mất thông tin quá sớm.

Tuy nhiên, toàn bộ `mixedValue()` cuối cùng vẫn nén thành một phần tử của \(\mathbb F_p\), nên hàm tổng thể không thể khả nghịch.

Đây cũng **không phải hàm băm mật mã**. Không nên dùng nó cho bảo mật, chống gian lận hoặc loot có giá trị thật.

---

# PHẦN IV — TỌA ĐỘ BIGINT VÀ HÀM NGẪU NHIÊN XÁC ĐỊNH

## 12. Ánh xạ Zigzag từ \(\mathbb Z\) sang \(\mathbb N\)

Tọa độ có thể âm. Hàm Zigzag ánh xạ:

\[
z\mapsto
\begin{cases}
2z,&z\ge0,\\
-2z-1,&z<0.
\end{cases}
\]

Ví dụ:

```text
 0 → 0
-1 → 1
 1 → 2
-2 → 3
 2 → 4
```

Đây là song ánh giữa số nguyên có dấu và số nguyên không âm. Nhờ đó có thể tách mọi tọa độ thành các limb mà không mất dấu.

---

## 13. Fold toàn bộ limb của tọa độ

Sau Zigzag, tọa độ được tách thành các khối 61 bit:

\[
z=\ell_0+\ell_1 2^{61}+\ell_2 2^{122}+\cdots.
\]

Mỗi limb thỏa:

\[
0\le\ell_i<2^{61}.
\]

`foldBigInt()` trộn lần lượt tất cả các limb:

\[
h_{i+1}=\operatorname{mix}(h_i+\ell_i+(i+1)C_4).
\]

Nhờ vậy, tọa độ rất lớn như \(10^{100}\) không bị rút gọn chỉ bằng một phép `% p` ngay từ đầu. Mọi limb đều có ảnh hưởng đến kết quả.

### 13.1. Giới hạn quan trọng

Kết quả fold vẫn chỉ thuộc \(\mathbb F_p\), tức có đúng \(p\) khả năng. Vì miền đầu vào vô hạn, tồn tại vô số cặp tọa độ có cùng kết quả fold theo nguyên lý Dirichlet.

Điểm tốt của fold là nó phá vỡ chu kỳ đơn giản kiểu:

\[
z\mapsto z\bmod p.
\]

Nó không thể loại bỏ va chạm tuyệt đối, nhưng có thể khiến va chạm không còn xuất hiện theo một chu kỳ tuyến tính dễ thấy.

---

## 14. Một chi tiết triển khai cần sửa trước khi đổi \(p\)

Source hiện có:

```ts
const limb = value & P;
value >>= 61n;
```

Điều này chỉ đúng vì:

\[
P=2^{61}-1,
\]

nên biểu diễn nhị phân của \(P\) chính là mask 61 bit toàn số 1.

Nên tách rõ:

```ts
const LIMB_BITS = 61n;
const LIMB_MASK = (1n << LIMB_BITS) - 1n;
```

và dùng:

```ts
const limb = value & LIMB_MASK;
value >>= LIMB_BITS;
```

Khi đó \(p\) và cách chia limb không bị gắn cứng vào nhau.

---

## 15. `randomAt(x,y,salt)`

Tại tọa độ nguyên \((x,y)\), source thực hiện:

1. Tính chunk chứa tọa độ:

\[
c_x=\left\lfloor\frac{x}{K}\right\rfloor,
\qquad
c_y=\left\lfloor\frac{y}{K}\right\rfloor,
\]

với \(K=16\).

2. Lấy trạng thái:

\[
C=C(c_x,c_y).
\]

3. Fold tuyệt đối tọa độ:

\[
h_x=F(x,\text{salt}\oplus C_2),
\]

\[
h_y=F(y,\text{salt}\oplus C_3).
\]

4. Trộn:

\[
r=M(C,h_x,h_y,\text{salt})\in\mathbb F_p.
\]

Kết quả là một **counter-based deterministic random function**: không có state PRNG tăng dần, nên thứ tự gọi không ảnh hưởng kết quả.

Điều này rất phù hợp với thế giới procedural:

\[
R(x,y,s)=\text{hàm thuần túy của }x,y,s,\text{seed}.
\]

Cache có thể xóa bất cứ lúc nào mà không thay đổi đầu ra.

---

## 16. Salt và domain separation

Salt tách các mục đích sử dụng khác nhau:

```text
heightA, heightB, heightC
moistureA, moistureB
tree, rock, flower
waterPhase
```

Về ý tưởng:

\[
R(x,y,s_1)\quad\text{và}\quad R(x,y,s_2)
\]

phải hoạt động như hai trường ngẫu nhiên độc lập khi \(s_1\ne s_2\).

Đây gọi là **domain separation**. Nó giúp cùng tọa độ không buộc chiều cao, cây và đá phải tương quan trực tiếp.

Nên tiếp tục quy ước salt rõ ràng cho:

- quái;
- rương;
- tài nguyên;
- NPC;
- biến thể model;
- màu sắc;
- nhiệm vụ;
- loot.

---

## 17. Chuyển số nguyên thành số thực trong \([0,1)\)

TypeScript hiện dùng:

\[
u=\frac{r\ \&\ (2^{53}-1)}{2^{53}}.
\]

JavaScript `number` có 53 bit chính xác trong mantissa, nên đầu ra có tối đa khoảng \(2^{53}\) mức.

Một lựa chọn rõ ràng hơn là lấy 53 bit cao:

```ts
const top53 = value >> 8n; // vì value có tối đa 61 bit
return Number(top53) / 2 ** 53;
```

Lý do:

- không phụ thuộc riêng các bit thấp;
- phép chuyển `Number(top53)` là chính xác;
- vẫn thu được số trong \([0,1)\).

Sự khác biệt chỉ đáng kể khi mixer có chất lượng bit cao/thấp không đều. Vì mixer hiện tại chưa có chứng minh thống kê, nên nên đo cả histogram và autocorrelation.

---

# PHẦN V — VALUE NOISE VÀ ĐỊA HÌNH

## 18. Value noise hai chiều

Với scale \(s\), tọa độ được phân tích:

\[
x=g_xs+r_x,\qquad0\le r_x<s,
\]

\[
y=g_ys+r_y,\qquad0\le r_y<s.
\]

Tỷ lệ nội suy:

\[
t_x=\frac{r_x}{s},\qquad t_y=\frac{r_y}{s}.
\]

Source dùng smoothstep:

\[
\sigma(t)=3t^2-2t^3.
\]

Ta có:

\[
\sigma(0)=0,\quad \sigma(1)=1,
\]

\[
\sigma'(0)=\sigma'(1)=0.
\]

Lấy bốn giá trị ở góc ô lưới:

\[
n_{00},n_{10},n_{01},n_{11}.
\]

Nội suy song tuyến tính sau khi làm mượt:

\[
a=(1-\sigma(t_x))n_{00}+\sigma(t_x)n_{10},
\]

\[
b=(1-\sigma(t_x))n_{01}+\sigma(t_x)n_{11},
\]

\[
N(x,y)=(1-\sigma(t_y))a+\sigma(t_y)b.
\]

Kết quả liên tục và có đạo hàm bậc nhất bằng 0 ở biên ô noise.

---

## 19. Noise nhiều tỉ lệ

Chiều cao hiện tại:

\[
H(x,y)=0.52N_{96}(x,y)+0.30N_{37}(x,y)+0.18N_{13}(x,y).
\]

Các trọng số có tổng:

\[
0.52+0.30+0.18=1.
\]

Do mỗi noise nằm trong \([0,1)\), nên gần như:

\[
0\le H(x,y)<1.
\]

Ý nghĩa:

- scale 96: hình dạng lớn, đồi và vùng thấp rộng;
- scale 37: cấu trúc trung bình;
- scale 13: chi tiết nhỏ.

Độ ẩm:

\[
M(x,y)=0.72N_{71}(x,y)+0.28N_{19}(x,y).
\]

Các scale không phải lũy thừa hai và không trùng nhau, giúp giảm cộng hưởng lưới đơn giản.

---

## 20. Phân loại biome hiện tại

Biomes được quyết định bằng ngưỡng:

\[
H<0.29\Rightarrow \text{water},
\]

\[
H>0.80\Rightarrow \text{mountain},
\]

\[
0.29\le H<0.34\Rightarrow \text{sand},
\]

sau đó dùng moisture:

\[
M>0.67\Rightarrow \text{forest},
\]

\[
M<0.34\Rightarrow \text{soil},
\]

còn lại là grass.

Đây là bộ phân lớp hai chiều:

\[
\operatorname{Biome}=f(H,M).
\]

Nó đơn giản, xác định và nhanh, nhưng thế giới dễ có cảm giác “noise soup” vì chưa có:

- nhiệt độ;
- continentalness;
- erosion;
- độ gồ ghề;
- khoảng cách tới biển;
- vĩ độ giả;
- vùng khí hậu cấp macro.

`SALTS.temperature` hiện đã tồn tại nhưng chưa được dùng.

---

## 21. Hàm chuyển height thành elevation đang bị gián đoạn

Source hiện tại dùng gần giống:

\[
E(H)=
\begin{cases}
-0.35+0.6H,&H<0.29,\\
3.6(H-0.29),&0.29\le H\le0.80,\\
1.6+14(H-0.80),&H>0.80.
\end{cases}
\]

Tại ngưỡng nước:

\[
\lim_{H\to0.29^-}E(H)=-0.176,
\]

nhưng:

\[
E(0.29)=0.
\]

Có một bước nhảy khoảng \(0.176\).

Tại ngưỡng núi:

\[
E(0.80)=3.6(0.51)=1.836,
\]

trong khi nhánh núi bắt đầu gần \(1.6\), tạo bước nhảy xuống khoảng \(0.236\).

Như vậy \(E(H)\) không liên tục tại hai ngưỡng. Điều này có thể tạo bậc địa hình nhân tạo.

Một phiên bản liên tục hơn:

\[
E(H)=
\begin{cases}
-d\left(1-\dfrac{H}{h_w}\right)^2,&H<h_w,\\
a(H-h_w),&h_w\le H\le h_m,\\
a(h_m-h_w)+b(H-h_m)^\gamma,&H>h_m.
\end{cases}
\]

Trong đó:

- \(h_w=0.29\);
- \(h_m=0.80\);
- \(a\) là độ dốc vùng đất;
- \(b,\gamma\) điều khiển núi;
- các nhánh khớp đúng tại ngưỡng.

Có thể dùng smoothstep quanh ngưỡng để cả đạo hàm cũng chuyển tiếp mềm.

---

## 22. Vì sao các chunk nối liền về độ cao?

Chunk \((c_x,c_y)\) lấy mẫu tại tọa độ toàn cục:

\[
x=c_xK+i,
\qquad
y=c_yK+j.
\]

Mép phải của chunk \(c_x\) có:

\[
x=c_xK+K=(c_x+1)K.
\]

Đây chính là mép trái của chunk kế bên. Vì hàm height là xác định theo tọa độ toàn cục, hai bên lấy cùng giá trị.

Đó là lý do self-test có thể kiểm tra:

\[
H_{c_x}(K,j)=H_{c_x+1}(0,j).
\]

### 22.1. Normal vẫn có thể tạo seam ánh sáng

Nếu normal ở biên được tính bằng sai phân một phía hoặc clamp trong từng chunk, hai chunk có thể có cùng độ cao nhưng normal khác nhau.

Cách toán học tốt hơn:

\[
\frac{\partial E}{\partial x}\approx\frac{E(x+\varepsilon,z)-E(x-\varepsilon,z)}{2\varepsilon},
\]

\[
\frac{\partial E}{\partial z}\approx\frac{E(x,z+\varepsilon)-E(x,z-\varepsilon)}{2\varepsilon}.
\]

Dùng hàm height toàn cục ở cả hai phía biên sẽ cho normal nhất quán.

---

# PHẦN VI — SINH OBJECT XÁC ĐỊNH

## 23. Bernoulli sampling theo ô

Ví dụ cây trong forest được sinh khi:

\[
R(x,y,\text{tree})<0.26.
\]

Nếu các mẫu gần độc lập và có \(N\) ô forest, số cây \(X\) xấp xỉ phân bố nhị thức:

\[
X\sim\operatorname{Binomial}(N,0.26).
\]

Kỳ vọng:

\[
\mathbb E[X]=0.26N.
\]

Độ lệch chuẩn:

\[
\sigma_X=\sqrt{N\cdot0.26\cdot0.74}.
\]

Vị trí được jitter trong ô, scale và rotation lấy từ các salt phụ khác nhau. Cách này:

- nhanh;
- dễ tái tạo;
- phù hợp `InstancedMesh`.

Nhược điểm:

- vẫn có dấu vết lưới;
- có thể có hai cây quá gần ở hai ô cạnh nhau;
- cụm cây chưa có cấu trúc sinh thái.

### 23.1. Cải tiến bằng deterministic Poisson disk

Chia không gian thành cell. Mỗi cell tạo một ứng viên bằng hash. Chỉ giữ ứng viên nếu nó có độ ưu tiên cao hơn mọi ứng viên lân cận trong bán kính cho trước.

Ý tưởng:

\[
\text{keep}(q)\iff priority(q)>priority(r),\quad\forall r\in\mathcal N(q).
\]

Kết quả:

- khoảng cách tối thiểu giữa object;
- không cần state toàn cục;
- vẫn random-access và deterministic;
- giảm cảm giác object nằm theo lưới.

---

## 24. ID object và tọa độ âm

Khi xác định chunk từ tọa độ âm, phải dùng floor division:

\[
\left\lfloor\frac{-1}{16}\right\rfloor=-1.
\]

JavaScript BigInt `/` lại trunc về 0:

\[
-1/16=0\quad\text{theo truncation}.
\]

Vì vậy ID object không nên dùng trực tiếp:

```ts
wx / BigInt(CHUNK_SIZE)
```

mà phải dùng `floorDiv()`.

Nếu không, object ở vùng tọa độ âm có thể nhận chunk ID sai, gây lỗi save rương/vật phẩm hoặc trùng khóa.

Khóa bền vững nên gồm:

```text
worldGeneratorVersion
seedHash
entityType
chunkX, chunkY
localCandidateIndex hoặc localX, localY
```

---

# PHẦN VII — FLOATING ORIGIN

## 25. Lý do cần floating origin

Three.js/WebGL dùng số thực dấu phẩy động. Khi tọa độ tăng rất lớn, khoảng cách giữa hai số biểu diễn được cũng tăng.

Một `float32` có khoảng 24 bit độ chính xác. Gần \(2^{30}\), bước nhỏ nhất có thể lớn đến khoảng:

\[
2^{30-23}=128.
\]

Khi đó chuyển động nhỏ hơn có thể bị mất, gây:

- rung camera;
- mesh nhấp nháy;
- collision lệch;
- vật thể không đứng đúng mặt đất.

Kiến trúc đúng là tách:

\[
W=O+L,
\]

trong đó:

- \(W\): tọa độ thế giới chính xác, dùng `BigInt` cho phần nguyên;
- \(O\): floating origin lớn;
- \(L\): tọa độ render nhỏ quanh gốc, dùng `number`.

GPU chỉ nhận \(L\), còn world generator nhận \(W\).

### 25.1. Nguyên tắc bắt buộc

Không bao giờ làm:

```ts
Number(hugeBigIntCoordinate)
```

rồi mới trừ origin, vì độ chính xác đã mất trước khi trừ.

Phải trừ trong miền BigInt trước:

\[
\Delta=W-O,
\]

sau đó mới chuyển phần nhỏ \(\Delta\) sang `number`.

---

# PHẦN VIII — CACHE VÀ TÍNH THUẦN TÚY

## 26. LRU cache không phải một phần của kết quả toán học

Chunk state và random tại tọa độ là hàm thuần túy:

\[
C=F_C(seed,c_x,c_y),
\]

\[
R=F_R(seed,x,y,salt).
\]

Cache chỉ lưu kết quả để giảm thời gian. Vì vậy invariant quan trọng là:

\[
F(\text{trước khi clear cache})=F(\text{sau khi clear cache}).
\]

Source đã có self-test regeneration và cache bound. Đây là hướng kiểm thử đúng.

### 26.1. Cache random bị thiếu trong bản TypeScript

Bản Python có `random_cache`, còn bản TypeScript hiện chủ yếu cache trạng thái chunk. Trong khi một lần sinh terrain gọi lại rất nhiều lattice value giống nhau.

Có thể thêm:

- LRU random toàn worker;
- hoặc cache cục bộ theo một lần sinh chunk;
- hoặc precompute các lattice point cần thiết cho từng octave.

Cache này không đổi kết quả, chỉ giảm chi phí.

---

# PHẦN IX — GIỚI HẠN VÀ ĐÁNH GIÁ TRUNG THỰC

## 27. Kiến trúc ma trận đóng góp gì?

Lớp ma trận mang lại:

- địa chỉ chunk đảo ngược được;
- cập nhật lân cận nhanh;
- tính độc lập đường đi có chứng minh rõ;
- một trạng thái vùng có cấu trúc;
- khả năng nghiên cứu chu kỳ/quỹ đạo bằng đại số hữu hạn.

Nhưng cần nhìn nhận:

> Chỉ riêng một hash tốt của `(seed, x, y, salt)` đã đủ để tạo procedural world không biên và deterministic.

Do đó lớp ma trận không phải điều kiện bắt buộc để game có map vô hạn. Giá trị riêng của nó là:

- tạo “regional state” có quan hệ khả nghịch;
- cho phép chunk lân cận suy ra từ nhau;
- tạo bản sắc toán học riêng cho dự án.

Chất lượng hình ảnh cuối cùng vẫn phụ thuộc chủ yếu vào:

- hàm băm tọa độ;
- noise;
- biome model;
- macro features;
- placement algorithm.

---

## 28. Không gian trạng thái lớn không đồng nghĩa với bản đồ đẹp

Một \(p\) lớn hoặc ma trận nhiều trạng thái chỉ đảm bảo có nhiều trạng thái tiềm năng. Nó không tự đảm bảo:

- phân bố đồng đều;
- không có tương quan;
- không có sọc theo trục;
- núi, sông và biome hợp lý;
- gameplay thú vị.

Ví dụ một hàm có \(2^{244}\) seed nhưng chỉ luôn trả địa hình phẳng vẫn có không gian seed lớn mà chất lượng thấp.

Cần tách hai mục tiêu:

\[
\text{state diversity}
\]

và:

\[
\text{spatial structure quality}.
\]

---

## 29. Mixer hiện tại chưa có chứng minh mạnh

`mix61()` dùng XOR-shift và nhân modulo \(p\). Đây là thiết kế heuristic hợp lý cho prototype, nhưng chưa có chứng minh rằng nó:

- là hoán vị trên \(\mathbb F_p\);
- có avalanche lý tưởng;
- không có bias bit;
- không có tương quan theo trục;
- có chất lượng tương đương các hash đã được kiểm nghiệm.

Nên xem nó là **non-cryptographic experimental mixer**.

Hướng cải tiến:

1. Tách hash tọa độ khỏi số học trường.
2. Dùng một mixer 64 bit đã được nghiên cứu trong vành \(\mathbb Z/2^{64}\mathbb Z\).
3. Mask rõ 64 bit sau mỗi phép toán.
4. Sau cùng mới ánh xạ sang \(\mathbb F_p\) nếu cần.
5. Chạy statistical tests trước khi thay thế chính thức.

Không nên tự tuyên bố “ngẫu nhiên tốt” chỉ dựa trên việc nhìn terrain có vẻ đa dạng.

---

## 30. Tính xác định giữa thiết bị

BigInt và số học modulo là chính xác. Nhưng phần noise dùng `number` IEEE-754.

Các phép cộng, nhân và chia cơ bản thường ổn định. Tuy vậy nếu muốn deterministic tuyệt đối cho multiplayer hoặc save lâu dài, nên tách:

- **authoritative generation**: biome, spawn, chest, quest dùng integer/fixed-point;
- **visual generation**: normal, màu, chi tiết nhỏ có thể dùng float.

Ví dụ spawn 26% có thể so sánh hoàn toàn bằng số nguyên:

\[
R < \left\lfloor0.26p\right\rfloor,
\]

thay vì chuyển sang float rồi so với `0.26`.

Biome và height cũng có thể lượng tử hóa theo fixed-point nếu cần tính xác định bit-for-bit.

---

# PHẦN X — CÁC HƯỚNG CẢI TIẾN TOÁN HỌC

## 31. Mức 0 — sửa tính đúng và độ bền

Các việc nên làm trước:

### 31.1. Tách `LIMB_MASK` khỏi \(P\)

Đã trình bày ở mục 14.

### 31.2. Dùng floor division ở mọi tọa độ âm

Bao gồm:

- chunk lookup;
- entity ID;
- save key;
- macro region;
- noise lattice.

### 31.3. Làm `terrainElevation()` liên tục

Nên kiểm tra cả liên tục giá trị \(C^0\), và tốt hơn là liên tục đạo hàm \(C^1\).

### 31.4. Lưu `worldGeneratorVersion`

Save tối thiểu:

```ts
{
  seed: "...",
  worldGeneratorVersion: 1
}
```

Bất kỳ thay đổi nào ở:

- \(p\);
- cách suy ra \(A,B\);
- mixer;
- salts;
- noise scales;
- biome thresholds;

đều có thể đổi map và phải tăng version.

### 31.5. Kiểm tra seed suy biến

Có thể:

- từ chối \(\det(S)=0\);
- hoặc hash/retry đến khi nhận seed khả nghịch;
- hoặc cho phép nhưng cảnh báo “reduced orbit quality”.

---

## 32. Mức 1 — tăng chu kỳ ma trận thật sự

### 32.1. Kiểm tra bậc nhỏ

Cách thực dụng:

- reject nếu \(A^k=I\) hoặc \(B^k=I\) với \(k\) nhỏ;
- kiểm tra một tập số mũ đặc biệt;
- kiểm tra polynomial đặc trưng không có cấu trúc quá đơn giản.

Đây không chứng minh bậc cực đại, nhưng loại các trường hợp tệ rõ ràng.

### 32.2. Companion matrix của đa thức nguyên thủy

Một hướng mạnh hơn là chọn \(A\) làm companion matrix của một primitive polynomial bậc \(n\) trên \(\mathbb F_p\). Khi đó có thể đạt:

\[
\operatorname{ord}(A)=p^n-1.
\]

Đây được gọi là Singer cycle trong \(GL(n,p)\).

Tương tự cho \(B\). Tuy nhiên cần:

- tìm hoặc kiểm tra primitive polynomial;
- factor các phần cần thiết của \(p^n-1\);
- quản lý giao giữa hai nhóm cyclic.

### 32.3. Chọn bậc gần nguyên tố cùng nhau

Nếu chọn:

\[
\gcd(r_A,r_B)=1,
\]

thì giao của hai nhóm cyclic liên hợp chỉ có thể chứa phần tử đơn vị. Với \(S\) khả nghịch, điều này giúp quỹ đạo hai chiều đạt gần:

\[
r_A r_B.
\]

Đây là hướng nghiên cứu tốt nếu mục tiêu của anh là chứng minh một cận chu kỳ hai chiều lớn.

---

## 33. Mức 2 — cải thiện hash và hiệu năng

### 33.1. Tạo một `chunkKey` một lần

Hiện nhiều random sample phải trộn lại ma trận. Có thể thiết kế:

\[
K_c=H(\operatorname{flatten}(C(c_x,c_y)),c_x,c_y,seedVersion).
\]

Sau đó mọi mẫu trong chunk dùng:

\[
R(x,y,s)=H(K_c,x_{local},y_{local},s).
\]

Lợi ích:

- ma trận vẫn tạo bản sắc chunk;
- giảm số recurrence round trên từng sample;
- dễ cache;
- hiệu năng worker tốt hơn nhiều.

Cần đảm bảo lattice point ở biên dùng quy ước chunk canonical giống nhau để noise không seam.

### 33.2. Cache lattice point theo octave

Với một chunk, mỗi octave chỉ cần một vùng nhỏ các giá trị grid. Precompute:

```text
octave scale 96 → tập lattice points cần dùng
octave scale 37 → tập lattice points cần dùng
octave scale 13 → tập lattice points cần dùng
```

Sau đó nội suy từ mảng, thay vì gọi `randomAt()` lặp lại.

### 33.3. Hash hai tầng

Một kiến trúc cân bằng:

```text
Matrix state C(cx,cy)
    ↓ hash chậm nhưng chỉ 1 lần/chunk
Chunk key 128 bit
    ↓ hash nhanh theo local coordinate + salt
Hàng nghìn mẫu noise/decor
```

Lớp ma trận giữ ý tưởng riêng, còn hash nhanh giải quyết FPS.

---

## 34. Mức 3 — nâng địa hình khỏi “noise soup”

### 34.1. Thêm climate vector nhiều chiều

Thay vì chỉ \((H,M)\), dùng:

\[
V(x,y)=(C,E,P,T,M,W),
\]

trong đó:

- \(C\): continentalness;
- \(E\): erosion;
- \(P\): peaks/ridges;
- \(T\): temperature;
- \(M\): moisture;
- \(W\): weirdness hoặc regional style.

Biome là một hàm phân lớp:

\[
\operatorname{Biome}=f(V).
\]

Điều này tạo vùng khí hậu có logic hơn và cho phép mở rộng.

### 34.2. Ridged multifractal cho núi

Từ noise \(N\in[0,1]\), tạo ridge:

\[
R=1-|2N-1|.
\]

Sau đó nâng lũy thừa:

\[
R_\gamma=R^\gamma.
\]

Nó tạo sống núi sắc hơn value noise thông thường.

### 34.3. Domain warping

Tạo trường dịch chuyển:

\[
q_x=x+\alpha N_1(x,y),
\]

\[
q_y=y+\alpha N_2(x,y),
\]

rồi lấy:

\[
H(x,y)=N_3(q_x,q_y).
\]

Điều này bẻ cong đường đồng mức, giảm cảm giác lưới và tạo thung lũng tự nhiên hơn.

### 34.4. Macro regions và Voronoi

Mỗi macro-cell sinh một feature point xác định. Tại vị trí \(x\), tìm feature point gần nhất hoặc hai điểm gần nhất.

Có thể dùng:

\[
F_1(x)=\text{khoảng cách gần nhất},
\]

\[
F_2(x)=\text{khoảng cách gần nhì}.
\]

Các đại lượng như \(F_2-F_1\) tạo đường biên vùng, phù hợp cho:

- vách đá;
- vùng biome;
- lãnh thổ;
- đường tự nhiên;
- vị trí landmark.

Kết hợp macro Voronoi với noise local sẽ cho thế giới có cấu trúc lớn thay vì chỉ biến đổi ngẫu nhiên liên tục.

---

## 35. Mức 4 — sông và landmark không cần mô phỏng toàn thế giới

Mô phỏng thủy văn toàn cục không phù hợp random access. Có thể dùng cấu trúc phân cấp:

1. Chia thế giới thành macro-region lớn.
2. Mỗi region sinh một số node cao/thấp xác định.
3. Tạo graph giữa các node lân cận.
4. Chọn cạnh giảm độ cao làm luồng sông.
5. Khi sinh một chunk, chỉ truy vấn graph trong vài region xung quanh.

Như vậy:

- sông kéo dài qua nhiều chunk;
- không cần duyệt toàn thế giới;
- cùng seed luôn tái tạo;
- chi phí local và có giới hạn.

Landmark cũng có thể sinh bằng deterministic hierarchical cells:

```text
cell cấp 4096: thành phố lớn / núi đặc biệt
cell cấp 1024: làng / dungeon
cell cấp 256: trại / rương hiếm
```

Mỗi cấp có salt và quy tắc khoảng cách riêng.

---

# PHẦN XI — LOD VÀ TÍNH NHẤT QUÁN HÌNH HỌC

## 36. Lưới LOD lồng nhau

Nếu LOD cấp \(\ell\) có bước:

\[
\Delta_\ell=2^\ell\Delta_0,
\]

thì mọi đỉnh của LOD thô cũng là đỉnh của LOD mịn. Đây gọi là nested sampling.

Muốn mép chunk không nứt:

- hai chunk phải dùng cùng hàm height toàn cục;
- tọa độ đỉnh biên phải trùng nhau;
- LOD thô phải chọn tập con đỉnh của LOD mịn;
- normal nên lấy từ hàm toàn cục.

Terrain skirt chỉ che khe về thị giác. Nó không làm hai lưới thật sự nối topology.

Nếu cần chất lượng cao hơn có thể dùng:

- edge stitching;
- geomorphing;
- transvoxel-like transition;
- clipmap terrain.

Với game web mobile, skirt + nested LOD thường là lựa chọn cân bằng.

---

# PHẦN XII — KIỂM THỬ TOÁN HỌC VÀ THỐNG KÊ

## 37. Invariant bắt buộc

### 37.1. Nghịch đảo recurrence

\[
T_v^{-1}(T_v(u))=u.
\]

### 37.2. Nghịch đảo ma trận

\[
AA^{-1}=A^{-1}A=I.
\]

### 37.3. Neighbor consistency

\[
C(x+1,y)=AC(x,y),
\]

\[
C(x,y+1)=C(x,y)B.
\]

### 37.4. Path independence

Với mọi chuỗi bước có cùng tổng \((\Delta x,\Delta y)\), trạng thái cuối bằng nhau.

### 37.5. Cache independence

Clear cache không đổi hash chunk.

### 37.6. Seam

Mọi sample ở mép chung phải bằng nhau cả height và, nếu yêu cầu, normal.

### 37.7. Negative coordinates

Đặc biệt kiểm tra:

```text
-1, -16, -17
```

vì đây là các điểm dễ sai giữa floor và truncation.

---

## 38. Kiểm tra thống kê nên thêm

### 38.1. Histogram

Lấy hàng triệu mẫu \(U\in[0,1)\), chia thành \(k\) bin. Kỳ vọng mỗi bin gần:

\[
\frac{N}{k}.
\]

Dùng \(\chi^2\) để phát hiện bias lớn.

### 38.2. Autocorrelation

Với độ lệch \((d_x,d_y)\):

\[
\rho(d_x,d_y)=\operatorname{Corr}(R(x,y),R(x+d_x,y+d_y)).
\]

Kiểm tra các hướng:

- ngang;
- dọc;
- chéo;
- đúng bằng chunk size;
- đúng bằng các noise scale.

### 38.3. Spectral test bằng ảnh FFT

Render một ảnh lớn của random field hoặc height field, rồi xem phổ tần. Các đường sáng theo trục thường báo hiệu grid artifact hoặc chu kỳ.

### 38.4. Avalanche test

Thay đổi một bit của:

- seed;
- x;
- y;
- salt;

và đo tỷ lệ bit đầu ra thay đổi. Một mixer tốt thường hướng tới khoảng 50%.

### 38.5. Orbit test

Với nhiều seed, kiểm tra:

\[
A^k\ne I,\quad B^k\ne I
\]

cho mọi \(k\) trong một ngưỡng thực dụng, ví dụ vài triệu hoặc tập số mũ đã chọn.

Đây không chứng minh bậc cực đại, nhưng phát hiện chu kỳ ngắn.

### 38.6. Collision sampling

Sinh hash của hàng triệu tọa độ. Với không gian đầu ra \(m\), nghịch lý sinh nhật cho số va chạm kỳ vọng xấp xỉ:

\[
\frac{N(N-1)}{2m}.
\]

Có thể so số va chạm thực tế với mức kỳ vọng để phát hiện bias bất thường.

---

# PHẦN XIII — ĐỀ XUẤT KIẾN TRÚC PHIÊN BẢN 2

## 39. Kiến trúc đề xuất cân bằng toán học và FPS

```text
User seed string
    ↓ hash 128/256 bit có version
Seed matrix S khả nghịch
    ↓
A, B có kiểm tra bậc hoặc được xây từ primitive polynomial
    ↓
C(cx,cy) = A^cx S B^cy
    ↓ chỉ tính một lần mỗi chunk
chunkKey = Hash(C, cx, cy, generatorVersion)
    ↓
Fast counter hash(chunkKey, global lattice coordinate, salt)
    ↓
Climate vector nhiều chiều
    ↓
Macro-region + domain warp + ridged terrain
    ↓
Deterministic Poisson placement
    ↓
LOD lồng nhau + global normals
```

### 39.1. Phân vai rõ ràng

- **Ma trận**: regional identity, path independence, reversible addressing.
- **Hash nhanh**: random sample hàng loạt.
- **Noise/climate**: cấu trúc không gian.
- **Hierarchy**: landmark và thế giới cấp lớn.
- **Sparse save**: thay đổi do người chơi.

Cách này giữ nguyên linh hồn kiến trúc của anh nhưng tránh dùng recurrence nặng cho mọi điểm noise.

---

## 40. Thứ tự cải tiến nên thử

### Ưu tiên A — không đổi phong cách map quá nhiều

1. Tách `LIMB_MASK`.
2. Sửa floor division cho ID âm.
3. Làm elevation liên tục.
4. Thêm random/lattice cache.
5. Lấy 53 bit theo cách rõ ràng hơn.
6. Thêm statistical test.

### Ưu tiên B — tăng chất lượng địa hình

1. Dùng temperature salt hiện có.
2. Thêm continentalness và erosion.
3. Ridged noise cho núi.
4. Domain warp nhẹ.
5. Deterministic Poisson cho cây/đá.

### Ưu tiên C — tăng độ mạnh của kiến trúc ma trận

1. Bắt buộc \(S\) khả nghịch.
2. Reject \(A,B\) có chu kỳ nhỏ.
3. Nghiên cứu companion matrix primitive.
4. Đo giao \(\langle A\rangle\cap S\langle B\rangle S^{-1}\).

### Ưu tiên D — tối ưu game web

1. Hash ma trận thành chunk key một lần.
2. Precompute lattice values.
3. Chỉ worker sinh dữ liệu logic cần thiết.
4. Dùng LOD nested grid.
5. Sleep entity ở chunk xa.

---

# PHẦN XIV — KẾT LUẬN

Kiến trúc hiện tại có một nền toán học rõ ràng và khác biệt:

\[
C(c_x,c_y)=A^{c_x}SB^{c_y}\pmod p
\]

mang lại:

- địa chỉ chunk bất kỳ;
- di chuyển thuận/ngược;
- độc lập đường đi;
- tái tạo từ seed;
- cache hữu hạn.

Việc fold toàn bộ tọa độ BigInt giúp đầu ra không thừa hưởng trực tiếp chu kỳ đơn giản của trạng thái ma trận. Tuy nhiên:

- va chạm vẫn tất yếu;
- bậc của \(A,B\) chưa được đảm bảo lớn;
- mixer chưa có kiểm chứng thống kê mạnh;
- chất lượng map phụ thuộc noise/climate nhiều hơn kích thước trường;
- recurrence trên từng random sample có thể trở thành nút thắt FPS.

Hướng cải tiến có giá trị nhất là:

\[
\boxed{
\text{ma trận làm khóa vùng}
+\text{hash nhanh làm random local}
+\text{climate nhiều chiều}
+\text{generation phân cấp}
}
\]

Cách này vừa giữ được bản sắc toán học của dự án, vừa tiến gần hơn đến một thế giới mở có cấu trúc, đẹp và chạy mượt trên web/mobile.

---

## Phụ lục A — Các hằng số hiện tại

```text
p                     = 2^61 - 1
chunk size            = 16
terrain subdivisions  = 32
matrix dimension      = 2 với seed mặc định
height scales         = 96, 37, 13
height weights        = 0.52, 0.30, 0.18
moisture scales       = 71, 19
moisture weights      = 0.72, 0.28
water threshold       = 0.29
sand threshold        = 0.34
mountain threshold    = 0.80
forest moisture       = 0.67
soil moisture         = 0.34
```

## Phụ lục B — Checklist khi đổi thuật toán

- [ ] Cùng seed/tọa độ còn tái tạo giống nhau trong cùng generator version.
- [ ] `selfTest()` pass.
- [ ] Chunk seam pass ở cả tọa độ dương và âm.
- [ ] Teleport đến tọa độ \(10^{100}\) vẫn sinh được.
- [ ] Clear cache không đổi hash.
- [ ] Không có chu kỳ ngắn dễ thấy.
- [ ] Histogram random không bias lớn.
- [ ] Autocorrelation theo trục thấp.
- [ ] Worker time không tăng quá mức.
- [ ] Bundle và RAM không tăng vô hạn.
- [ ] Save key có seed hash và generator version.
