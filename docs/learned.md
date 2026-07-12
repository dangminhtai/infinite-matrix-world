## Bài học 2026-07-12

- Vấn đề: Cần đọc hiểu và phân tích cấu trúc một dự án game Web 3D phức tạp dựa trên toán học trường hữu hạn và Three.js mà không làm hỏng code hiện có.
- Điều học được:
  1. Cách tổ chức thuật toán Infinite Hybrid Matrix World kết hợp giữa Matrix Exponentiation (cho teleport/vùng xa) và Recurrence Relation (cho di chuyển lân cận) để tối ưu hóa hiệu năng tính toán.
  2. Cách giải quyết vấn đề giới hạn độ chính xác của kiểu dữ liệu Float 64 (number trong JS) bằng cơ chế Floating Origin (dời tâm scene khi di chuyển vượt ngưỡng) kết hợp với kiểu dữ liệu BigInt cho tọa độ thế giới thực.
  3. Cách tối ưu hóa render Three.js trên WebGL bằng cách sử dụng `InstancedMesh` để gom nhóm các vật thể trang trí (cây, đá, hoa) và quái (slime), thay vì tạo hàng ngàn component Mesh React riêng lẻ.
  4. Cơ chế truyền dữ liệu mượt giữa Main Thread và Web Worker thông qua các đối tượng có khả năng chuyển nhượng (Transferable Objects - Float32Array, Uint8Array) để giải phóng CPU của Main Thread.
- Cách áp dụng sau này:
  - Áp dụng kỹ thuật Floating Origin khi xây dựng các thế giới game 3D kích thước cực lớn hoặc vô hạn.
  - Sử dụng Instancing cho các đối tượng lặp lại nhiều lần để duy trì chỉ số Draw Call và Triangles thấp, đảm bảo FPS cao trên thiết bị di động.
  - Tách biệt logic tính toán nặng ra Web Worker và giao tiếp qua Transferable Objects để tránh giật lag UI (jank).
