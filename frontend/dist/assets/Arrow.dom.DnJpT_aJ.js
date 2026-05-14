import { i as isAsyncIterable, a as isIterable, _ as __awaiter, b as toUint8Array, A as AsyncByteQueue, R as RecordBatchReader, t as tableFromIPC, s as streamAdapters, c as RecordBatchFileReader, d as RecordBatchStreamReader } from './serialization.B92cbl4P.js';
export { e as AsyncByteStream, f as AsyncMessageReader, g as AsyncRecordBatchFileReader, h as AsyncRecordBatchStreamReader, B as Binary, j as Bool, k as BufferType, l as ByteStream, D as Data, m as DataType, n as DateUnit, o as Date_, p as Decimal, q as Dictionary, r as Duration, F as Field, u as FixedSizeBinary, v as FixedSizeList, w as Float, I as Int, x as Int32, y as Interval, z as IntervalUnit, J as JSONMessageReader, L as LargeBinary, C as LargeUtf8, E as List, M as MapRow, G as Map_, H as Message, K as MessageHeader, N as MessageReader, O as MetadataVersion, P as Null, Q as Precision, S as RecordBatch, T as Schema, U as Struct, V as StructRow, W as Table, X as Time, Y as TimeUnit, Z as Timestamp, $ as Type, a0 as Union, a1 as UnionMode, a2 as Utf8, a3 as Vector, a4 as Visitor, a5 as makeData } from './serialization.B92cbl4P.js';

// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
/** @ignore */
function toDOMStream(source, options) {
    if (isAsyncIterable(source)) {
        return asyncIterableAsReadableDOMStream(source, options);
    }
    if (isIterable(source)) {
        return iterableAsReadableDOMStream(source, options);
    }
    /* istanbul ignore next */
    throw new Error(`toDOMStream() must be called with an Iterable or AsyncIterable`);
}
/** @ignore */
function iterableAsReadableDOMStream(source, options) {
    let it = null;
    const bm = ((options === null || options === void 0 ? void 0 : options.type) === 'bytes') || false;
    const hwm = (options === null || options === void 0 ? void 0 : options.highWaterMark) || (Math.pow(2, 24));
    return new ReadableStream(Object.assign(Object.assign({}, options), { start(controller) { next(controller, it || (it = source[Symbol.iterator]())); },
        pull(controller) { it ? (next(controller, it)) : controller.close(); },
        cancel() { ((it === null || it === void 0 ? void 0 : it.return) && it.return() || true) && (it = null); } }), Object.assign({ highWaterMark: bm ? hwm : undefined }, options));
    function next(controller, it) {
        let buf;
        let r = null;
        let size = controller.desiredSize || null;
        while (!(r = it.next(bm ? size : null)).done) {
            if (ArrayBuffer.isView(r.value) && (buf = toUint8Array(r.value))) {
                size != null && bm && (size = size - buf.byteLength + 1);
                r.value = buf;
            }
            controller.enqueue(r.value);
            if (size != null && --size <= 0) {
                return;
            }
        }
        controller.close();
    }
}
/** @ignore */
function asyncIterableAsReadableDOMStream(source, options) {
    let it = null;
    const bm = ((options === null || options === void 0 ? void 0 : options.type) === 'bytes') || false;
    const hwm = (options === null || options === void 0 ? void 0 : options.highWaterMark) || (Math.pow(2, 24));
    return new ReadableStream(Object.assign(Object.assign({}, options), { start(controller) {
            return __awaiter(this, void 0, void 0, function* () { yield next(controller, it || (it = source[Symbol.asyncIterator]())); });
        },
        pull(controller) {
            return __awaiter(this, void 0, void 0, function* () { it ? (yield next(controller, it)) : controller.close(); });
        },
        cancel() {
            return __awaiter(this, void 0, void 0, function* () { ((it === null || it === void 0 ? void 0 : it.return) && (yield it.return()) || true) && (it = null); });
        } }), Object.assign({ highWaterMark: bm ? hwm : undefined }, options));
    function next(controller, it) {
        return __awaiter(this, void 0, void 0, function* () {
            let buf;
            let r = null;
            let size = controller.desiredSize || null;
            while (!(r = yield it.next(bm ? size : null)).done) {
                if (ArrayBuffer.isView(r.value) && (buf = toUint8Array(r.value))) {
                    size != null && bm && (size = size - buf.byteLength + 1);
                    r.value = buf;
                }
                controller.enqueue(r.value);
                if (size != null && --size <= 0) {
                    return;
                }
            }
            controller.close();
        });
    }
}

// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
/** @ignore */
function recordBatchReaderThroughDOMStream(writableStrategy, readableStrategy) {
    const queue = new AsyncByteQueue();
    let reader = null;
    const readable = new ReadableStream({
        cancel() {
            return __awaiter(this, void 0, void 0, function* () { yield queue.close(); });
        },
        start(controller) {
            return __awaiter(this, void 0, void 0, function* () { yield next(controller, reader || (reader = yield open())); });
        },
        pull(controller) {
            return __awaiter(this, void 0, void 0, function* () { reader ? yield next(controller, reader) : controller.close(); });
        }
    });
    return { writable: new WritableStream(queue, Object.assign({ 'highWaterMark': Math.pow(2, 14) }, writableStrategy)), readable };
    function open() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (yield RecordBatchReader.from(queue)).open(readableStrategy);
        });
    }
    function next(controller, reader) {
        return __awaiter(this, void 0, void 0, function* () {
            let size = controller.desiredSize;
            let r = null;
            while (!(r = yield reader.next()).done) {
                controller.enqueue(r.value);
                if (size != null && --size <= 0) {
                    return;
                }
            }
            controller.close();
        });
    }
}

// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
streamAdapters.toDOMStream = toDOMStream;
RecordBatchReader['throughDOM'] = recordBatchReaderThroughDOMStream;
RecordBatchFileReader['throughDOM'] = recordBatchReaderThroughDOMStream;
RecordBatchStreamReader['throughDOM'] = recordBatchReaderThroughDOMStream;

export { AsyncByteQueue, RecordBatchFileReader, RecordBatchReader, RecordBatchStreamReader, tableFromIPC };
//# sourceMappingURL=Arrow.dom.DnJpT_aJ.js.map
