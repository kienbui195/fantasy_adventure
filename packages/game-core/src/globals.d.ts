// structuredClone có sẵn ở cả Node (17+) và trình duyệt; khai báo ở đây để game-core không phụ thuộc lib DOM hay @types/node.
declare function structuredClone<T>(value: T): T;
