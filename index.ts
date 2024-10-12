import { PathLike } from 'node:fs';
import { Buffer } from 'node:buffer';
import { FileHandle, open } from 'node:fs/promises';
import { Readable, ReadableOptions } from 'node:stream';

interface Range {
  start: number;
  length: number;
}

interface Callback {
  (error?: Error | null): void;
}

class MultipartReadStream extends Readable {
  private path: PathLike;
  private ranges: Range[];
  private bytesRead: number;
  private fileHandle?: FileHandle;
  private currentRangeIndex: number;

  constructor(path: PathLike, ranges: Range[], options?: ReadableOptions) {
    super(options);
    this.path = path;
    this.bytesRead = 0;
    this.ranges = ranges;
    this.currentRangeIndex = 0;
  }

  _construct(callback: Callback): void {
    open(this.path, 'r').then(
      fileHandle => {
        this.fileHandle = fileHandle;

        callback();
      },
      error => {
        callback(error);
      }
    );
  }

  _read(size: number): void {
    const range = this.ranges[this.currentRangeIndex];

    if (range) {
      const position = range.start + this.bytesRead;
      const buffer = Buffer.alloc(Math.min(size, range.length - this.bytesRead));

      this.fileHandle?.read(buffer, 0, buffer.length, position).then(
        ({ buffer, bytesRead }) => {
          if (bytesRead === 0) {
            this.bytesRead = 0;
            this.currentRangeIndex++;

            // End of the current range, move to the next range.
            this._read(size);
          } else {
            this.bytesRead += bytesRead;

            if (this.bytesRead >= range.length) {
              // Current range is fully read, move to the next range.
              this.bytesRead = 0;
              this.currentRangeIndex++;
            }

            // Push the read data to the stream.
            if (buffer.length === bytesRead) {
              this.push(buffer);
            } else {
              this.push(buffer.subarray(0, bytesRead));
            }
          }
        },
        error => {
          this.destroy(error);
        }
      );
    } else {
      // No more ranges to read.
      this.push(null);
    }
  }

  _destroy(error: Error | null, callback: Callback): void {
    if (this.fileHandle) {
      this.fileHandle.close().finally(() => {
        callback(error);
      });
    } else {
      callback(error);
    }
  }
}

// 使用示例
const ranges: Range[] = [
  { start: 0, length: 10 },
  { start: 30, length: 10 },
  { start: 60, length: 10 }
];
const path = './tests/src/App.tsx';
const readStream = new MultipartReadStream(path, ranges, {
  highWaterMark: 64 * 1024
});

readStream.on('data', (chunk: Buffer) => {
  console.log('Read chunk:', chunk);
});

readStream.on('end', () => {
  console.log('Reached the end of the stream');
});

readStream.on('error', error => {
  console.error('Stream encountered an error:', error);
});
