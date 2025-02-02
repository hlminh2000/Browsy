
declare module 'idb-vector' {
  export interface CreateOptions {
    dbName?: string;
    objectStore?: string;
    vectorPath?: string;
  }

  export interface InsertObject {
    [key: string]: any; // This allows for any additional properties
    [vectorPath: string]: number[]; // Assuming vectorPath is an array of numbers
  }

  export interface QueryOptions {
    limit?: number;
  }

  export interface SimilarityResult {
    object: InsertObject;
    key: IDBValidKey;
    similarity: number;
  }

  export class VectorDB {
    private #objectStore: string;
    private #vectorPath: string;
    private #db: Promise<IDBDatabase>;

    constructor(options: CreateOptions);

    insert(object: InsertObject): Promise<IDBValidKey>;

    delete(key: IDBValidKey): Promise<void>;

    update(key: IDBValidKey, object: InsertObject): Promise<IDBValidKey>;

    query(queryVector: number[], options?: QueryOptions): Promise<SimilarityResult[]>;

    get objectStore(): string;
  }
}
