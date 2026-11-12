import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { APP_CONFIG, type AppConfig } from "../config.js";

/** Object storage: MinIO / S3 via env, or local filesystem for dev without Docker. */
@Injectable()
export class StorageService {
  private readonly s3?: S3Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    if (config.STORAGE_DRIVER === "s3") {
      this.s3 = new S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials:
          config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
            ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
            : undefined, // fall back to the default AWS credential chain
      });
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  private localPath(key: string): string {
    const root = resolve(this.config.STORAGE_LOCAL_DIR);
    const path = resolve(join(root, key));
    if (!path.startsWith(root)) throw new Error("Invalid storage key");
    return path;
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
