// @generated file from wasmbuild -- do not edit
// @ts-nocheck: generated
// deno-lint-ignore-file
// deno-fmt-ignore-file

let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (
        cachedUint8ArrayMemory0 === null ||
        cachedUint8ArrayMemory0.byteLength === 0
    ) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder("utf-8", {
    ignoreBOM: true,
    fatal: true,
});

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder("utf-8", {
            ignoreBOM: true,
            fatal: true,
        });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(
        getUint8ArrayMemory0().subarray(ptr, ptr + len),
    );
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = new TextEncoder();

if (!("encodeInto" in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length,
        };
    };
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (
        cachedDataViewMemory0 === null ||
        cachedDataViewMemory0.buffer.detached === true ||
        (cachedDataViewMemory0.buffer.detached === undefined &&
            cachedDataViewMemory0.buffer !== wasm.memory.buffer)
    ) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == "number" || type == "boolean" || val == null) {
        return `${val}`;
    }
    if (type == "string") {
        return `"${val}"`;
    }
    if (type == "symbol") {
        const description = val.description;
        if (description == null) {
            return "Symbol";
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == "function") {
        const name = val.name;
        if (typeof name == "string" && name.length > 0) {
            return `Function(${name})`;
        } else {
            return "Function";
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = "[";
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for (let i = 1; i < length; i++) {
            debug += ", " + debugString(val[i]);
        }
        debug += "]";
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == "Object") {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return "Object(" + JSON.stringify(val) + ")";
        } catch (_) {
            return "Object";
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === "undefined")
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((state) => state.dtor(state.a, state.b));

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @param {any} config
 * @param {any} debug_flags
 * @returns {JSRuntime}
 */
export function create_runtime(config, debug_flags) {
    const ret = wasm.create_runtime(config, debug_flags);
    return JSRuntime.__wrap(ret);
}

/**
 * Executes a Datex script and returns the result as a string.
 * @param {string} datex_script
 * @param {any} decompile_options
 * @returns {string}
 */
export function execute(datex_script, decompile_options) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(
            datex_script,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.execute(ptr0, len0, decompile_options);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Executes a Datex script and returns true when execution was successful.
 * Does not return the result of the script, but only indicates success or failure.
 * @param {string} datex_script
 * @returns {boolean}
 */
export function execute_internal(datex_script) {
    const ptr0 = passStringToWasm0(
        datex_script,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
    );
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.execute_internal(ptr0, len0);
    return ret !== 0;
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___wasm_bindgen_a1f4a02d1f896e12___JsValue_____(
    arg0,
    arg1,
    arg2,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___wasm_bindgen_a1f4a02d1f896e12___JsValue_____(
        arg0,
        arg1,
        arg2,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke______(
    arg0,
    arg1,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke______(
        arg0,
        arg1,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Uint8Array_____(
    arg0,
    arg1,
    arg2,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Uint8Array_____(
        arg0,
        arg1,
        arg2,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_Event__Event_____(
    arg0,
    arg1,
    arg2,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_Event__Event_____(
        arg0,
        arg1,
        arg2,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_ErrorEvent__ErrorEvent_____(
    arg0,
    arg1,
    arg2,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_ErrorEvent__ErrorEvent_____(
        arg0,
        arg1,
        arg2,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_MessageEvent__MessageEvent_____(
    arg0,
    arg1,
    arg2,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_MessageEvent__MessageEvent_____(
        arg0,
        arg1,
        arg2,
    );
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___bool_(
    arg0,
    arg1,
) {
    const ret = wasm
        .wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___bool_(
            arg0,
            arg1,
        );
    return ret !== 0;
}

function wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Function__js_sys_a822dd5f0901d71f___Function_____(
    arg0,
    arg1,
    arg2,
    arg3,
) {
    wasm.wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Function__js_sys_a822dd5f0901d71f___Function_____(
        arg0,
        arg1,
        arg2,
        arg3,
    );
}

const __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];

const BaseInterfaceHandleFinalization =
    (typeof FinalizationRegistry === "undefined")
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry((ptr) =>
            wasm.__wbg_baseinterfacehandle_free(ptr >>> 0, 1)
        );

export class BaseInterfaceHandle {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BaseInterfaceHandle.prototype);
        obj.__wbg_ptr = ptr;
        BaseInterfaceHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BaseInterfaceHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_baseinterfacehandle_free(ptr, 0);
    }
    /**
     * @param {string} socket_uuid
     * @param {Uint8Array} data
     */
    sendBlock(socket_uuid, data) {
        const ptr0 = passStringToWasm0(
            socket_uuid,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.baseinterfacehandle_sendBlock(
            this.__wbg_ptr,
            ptr0,
            len0,
            data,
        );
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} socket_uuid
     */
    removeSocket(socket_uuid) {
        const ptr0 = passStringToWasm0(
            socket_uuid,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.baseinterfacehandle_removeSocket(
            this.__wbg_ptr,
            ptr0,
            len0,
        );
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {Function} cb
     */
    onClosed(cb) {
        wasm.baseinterfacehandle_onClosed(this.__wbg_ptr, cb);
    }
    /**
     * @param {Function} cb
     */
    onReceive(cb) {
        wasm.baseinterfacehandle_onReceive(this.__wbg_ptr, cb);
    }
    /**
     * @param {string} direction
     * @param {number} channel_factor
     * @param {string | null} [direct_endpoint]
     * @returns {string}
     */
    registerSocket(direction, channel_factor, direct_endpoint) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(
                direction,
                wasm.__wbindgen_malloc,
                wasm.__wbindgen_realloc,
            );
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(direct_endpoint)
                ? 0
                : passStringToWasm0(
                    direct_endpoint,
                    wasm.__wbindgen_malloc,
                    wasm.__wbindgen_realloc,
                );
            var len1 = WASM_VECTOR_LEN;
            const ret = wasm.baseinterfacehandle_registerSocket(
                this.__wbg_ptr,
                ptr0,
                len0,
                channel_factor,
                ptr1,
                len1,
            );
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0;
                len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    destroy() {
        wasm.baseinterfacehandle_destroy(this.__wbg_ptr);
    }
    /**
     * Gets the current state of the interface
     * @returns {string}
     */
    getState() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.baseinterfacehandle_getState(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) {
    BaseInterfaceHandle.prototype[Symbol.dispose] =
        BaseInterfaceHandle.prototype.free;
}

const JSComHubFinalization = (typeof FinalizationRegistry === "undefined")
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_jscomhub_free(ptr >>> 0, 1));

export class JSComHub {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JSComHub.prototype);
        obj.__wbg_ptr = ptr;
        JSComHubFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JSComHubFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jscomhub_free(ptr, 0);
    }
    /**
     * Send a block to the given interface and socket
     * This does not involve the routing on the ComHub level.
     * The socket UUID is used to identify the socket to send the block over
     * The interface UUID is used to identify the interface to send the block over
     * @param {Uint8Array} block
     * @param {string} interface_uuid
     * @param {string} socket_uuid
     * @returns {Promise<void>}
     */
    send_block(block, interface_uuid, socket_uuid) {
        const ptr0 = passStringToWasm0(
            interface_uuid,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(
            socket_uuid,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.jscomhub_send_block(
            this.__wbg_ptr,
            block,
            ptr0,
            len0,
            ptr1,
            len1,
        );
        return ret;
    }
    /**
     * @param {string} interface_type
     * @param {any} setup_data
     * @param {number | null} [priority]
     * @returns {Promise<string>}
     */
    create_interface(interface_type, setup_data, priority) {
        const ptr0 = passStringToWasm0(
            interface_type,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.jscomhub_create_interface(
            this.__wbg_ptr,
            ptr0,
            len0,
            setup_data,
            isLikeNone(priority) ? 0xFFFFFF : priority,
        );
        return ret;
    }
    /**
     * @param {string} endpoint
     * @returns {Promise<string | undefined>}
     */
    get_trace_string(endpoint) {
        const ptr0 = passStringToWasm0(
            endpoint,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.jscomhub_get_trace_string(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_metadata() {
        const ret = wasm.jscomhub_get_metadata(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} interface_uuid
     */
    close_interface(interface_uuid) {
        const ptr0 = passStringToWasm0(
            interface_uuid,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.jscomhub_close_interface(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {string}
     */
    get_metadata_string() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.jscomhub_get_metadata_string(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} interface_type
     * @param {Function} factory
     */
    register_interface_factory(interface_type, factory) {
        const ptr0 = passStringToWasm0(
            interface_type,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        wasm.jscomhub_register_interface_factory(
            this.__wbg_ptr,
            ptr0,
            len0,
            factory,
        );
    }
    /**
     * @param {Function} callback
     */
    register_incoming_block_interceptor(callback) {
        wasm.jscomhub_register_incoming_block_interceptor(
            this.__wbg_ptr,
            callback,
        );
    }
    /**
     * @param {Function} callback
     */
    register_outgoing_block_interceptor(callback) {
        wasm.jscomhub_register_outgoing_block_interceptor(
            this.__wbg_ptr,
            callback,
        );
    }
    register_default_interface_factories() {
        wasm.jscomhub_register_default_interface_factories(this.__wbg_ptr);
    }
}
if (Symbol.dispose) {
    JSComHub.prototype[Symbol.dispose] = JSComHub.prototype.free;
}

const JSPointerFinalization = (typeof FinalizationRegistry === "undefined")
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) =>
        wasm.__wbg_jspointer_free(ptr >>> 0, 1)
    );

export class JSPointer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JSPointerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jspointer_free(ptr, 0);
    }
}
if (Symbol.dispose) {
    JSPointer.prototype[Symbol.dispose] = JSPointer.prototype.free;
}

const JSRuntimeFinalization = (typeof FinalizationRegistry === "undefined")
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) =>
        wasm.__wbg_jsruntime_free(ptr >>> 0, 1)
    );

export class JSRuntime {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JSRuntime.prototype);
        obj.__wbg_ptr = ptr;
        JSRuntimeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JSRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jsruntime_free(ptr, 0);
    }
    /**
     * @returns {Promise<Promise<any>>}
     */
    crypto_test_tmp() {
        const ret = wasm.jsruntime_crypto_test_tmp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} script
     * @param {any[] | null | undefined} dif_values
     * @param {any} decompile_options
     * @returns {Promise<string>}
     */
    execute_with_string_result(script, dif_values, decompile_options) {
        const ptr0 = passStringToWasm0(
            script,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(dif_values)
            ? 0
            : passArrayJsValueToWasm0(dif_values, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.jsruntime_execute_with_string_result(
            this.__wbg_ptr,
            ptr0,
            len0,
            ptr1,
            len1,
            decompile_options,
        );
        return ret;
    }
    /**
     * @returns {Promise<void>}
     */
    start() {
        const ret = wasm.jsruntime_start(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} script
     * @param {any[] | null} [dif_values]
     * @returns {Promise<any>}
     */
    execute(script, dif_values) {
        const ptr0 = passStringToWasm0(
            script,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(dif_values)
            ? 0
            : passArrayJsValueToWasm0(dif_values, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.jsruntime_execute(
            this.__wbg_ptr,
            ptr0,
            len0,
            ptr1,
            len1,
        );
        return ret;
    }
    /**
     * @returns {JSComHub}
     */
    get com_hub() {
        const ret = wasm.__wbg_get_jsruntime_com_hub(this.__wbg_ptr);
        return JSComHub.__wrap(ret);
    }
    /**
     * @param {JSComHub} arg0
     */
    set com_hub(arg0) {
        _assertClass(arg0, JSComHub);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_jsruntime_com_hub(this.__wbg_ptr, ptr0);
    }
    /**
     * @param {string} script
     * @param {any[] | null} [dif_values]
     * @returns {any}
     */
    execute_sync(script, dif_values) {
        const ptr0 = passStringToWasm0(
            script,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(dif_values)
            ? 0
            : passArrayJsValueToWasm0(dif_values, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.jsruntime_execute_sync(
            this.__wbg_ptr,
            ptr0,
            len0,
            ptr1,
            len1,
        );
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint8Array | null | undefined} body
     * @param {string[]} receivers
     * @returns {Uint8Array}
     */
    _create_block(body, receivers) {
        var ptr0 = isLikeNone(body)
            ? 0
            : passArray8ToWasm0(body, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayJsValueToWasm0(receivers, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.jsruntime__create_block(
            this.__wbg_ptr,
            ptr0,
            len0,
            ptr1,
            len1,
        );
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * @param {any} dif_value
     * @param {any} decompile_options
     * @returns {string}
     */
    value_to_string(dif_value, decompile_options) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.jsruntime_value_to_string(
                this.__wbg_ptr,
                dif_value,
                decompile_options,
            );
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0;
                len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} script
     * @param {any[] | null | undefined} dif_values
     * @param {any} decompile_options
     * @returns {string}
     */
    execute_sync_with_string_result(script, dif_values, decompile_options) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(
                script,
                wasm.__wbindgen_malloc,
                wasm.__wbindgen_realloc,
            );
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(dif_values)
                ? 0
                : passArrayJsValueToWasm0(dif_values, wasm.__wbindgen_malloc);
            var len1 = WASM_VECTOR_LEN;
            const ret = wasm.jsruntime_execute_sync_with_string_result(
                this.__wbg_ptr,
                ptr0,
                len0,
                ptr1,
                len1,
                decompile_options,
            );
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0;
                len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Get a handle to the DIF interface of the runtime
     * @returns {RuntimeDIFHandle}
     */
    dif() {
        const ret = wasm.jsruntime_dif(this.__wbg_ptr);
        return RuntimeDIFHandle.__wrap(ret);
    }
    /**
     * @returns {string}
     */
    get version() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.jsruntime_version(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get endpoint() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.jsruntime_endpoint(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Start the LSP server, returning a JS function to send messages to Rust
     * @param {Function} send_to_js
     * @returns {Function}
     */
    start_lsp(send_to_js) {
        const ret = wasm.jsruntime_start_lsp(this.__wbg_ptr, send_to_js);
        return ret;
    }
}
if (Symbol.dispose) {
    JSRuntime.prototype[Symbol.dispose] = JSRuntime.prototype.free;
}

const RuntimeDIFHandleFinalization =
    (typeof FinalizationRegistry === "undefined")
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry((ptr) =>
            wasm.__wbg_runtimedifhandle_free(ptr >>> 0, 1)
        );

export class RuntimeDIFHandle {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RuntimeDIFHandle.prototype);
        obj.__wbg_ptr = ptr;
        RuntimeDIFHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RuntimeDIFHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_runtimedifhandle_free(ptr, 0);
    }
    /**
     * @param {any} value
     * @param {any} allowed_type
     * @param {number} mutability
     * @returns {string}
     */
    create_pointer(value, allowed_type, mutability) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.runtimedifhandle_create_pointer(
                this.__wbg_ptr,
                value,
                allowed_type,
                mutability,
            );
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0;
                len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} transceiver_id
     * @param {string} address
     * @param {any} observe_options
     * @param {Function} callback
     * @returns {number}
     */
    observe_pointer(transceiver_id, address, observe_options, callback) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_observe_pointer(
            this.__wbg_ptr,
            transceiver_id,
            ptr0,
            len0,
            observe_options,
            callback,
        );
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @param {string} address
     * @param {number} observer_id
     */
    unobserve_pointer(address, observer_id) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_unobserve_pointer(
            this.__wbg_ptr,
            ptr0,
            len0,
            observer_id,
        );
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Resolve a pointer address, returning a Promise
     * If the pointer is in memory, the promise resolves immediately
     * If the pointer is not in memory, it will be loaded first
     * @param {string} address
     * @returns {any}
     */
    resolve_pointer_address(address) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_resolve_pointer_address(
            this.__wbg_ptr,
            ptr0,
            len0,
        );
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} address
     * @param {number} observer_id
     * @param {any} observe_options
     */
    update_observer_options(address, observer_id, observe_options) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_update_observer_options(
            this.__wbg_ptr,
            ptr0,
            len0,
            observer_id,
            observe_options,
        );
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Resolve a pointer address synchronously if it's in memory, otherwise return an error
     * @param {string} address
     * @returns {any}
     */
    resolve_pointer_address_sync(address) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_resolve_pointer_address_sync(
            this.__wbg_ptr,
            ptr0,
            len0,
        );
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} callee
     * @param {any} value
     * @returns {any}
     */
    apply(callee, value) {
        const ret = wasm.runtimedifhandle_apply(this.__wbg_ptr, callee, value);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {number} transceiver_id
     * @param {string} address
     * @param {any} update
     */
    update(transceiver_id, address, update) {
        const ptr0 = passStringToWasm0(
            address,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.runtimedifhandle_update(
            this.__wbg_ptr,
            transceiver_id,
            ptr0,
            len0,
            update,
        );
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) {
    RuntimeDIFHandle.prototype[Symbol.dispose] =
        RuntimeDIFHandle.prototype.free;
}

export function __wbg_Error_e83987f665cf5504(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
}

export function __wbg_Number_bb48ca12f395cd08(arg0) {
    const ret = Number(arg0);
    return ret;
}

export function __wbg_String_8f0eb39a4a4c2f66(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(
        ret,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
    );
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbg___wbindgen_bigint_get_as_i64_f3ebc5a755000afd(
    arg0,
    arg1,
) {
    const v = arg1;
    const ret = typeof v === "bigint" ? v : undefined;
    getDataViewMemory0().setBigInt64(
        arg0 + 8 * 1,
        isLikeNone(ret) ? BigInt(0) : ret,
        true,
    );
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}

export function __wbg___wbindgen_boolean_get_6d5a1ee65bab5f68(arg0) {
    const v = arg0;
    const ret = typeof v === "boolean" ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
}

export function __wbg___wbindgen_debug_string_df47ffb5e35e6763(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(
        ret,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
    );
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbg___wbindgen_in_bb933bd9e1b3bc0f(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
}

export function __wbg___wbindgen_is_bigint_cb320707dcd35f0b(arg0) {
    const ret = typeof arg0 === "bigint";
    return ret;
}

export function __wbg___wbindgen_is_function_ee8a6c5833c90377(arg0) {
    const ret = typeof arg0 === "function";
    return ret;
}

export function __wbg___wbindgen_is_null_5e69f72e906cc57c(arg0) {
    const ret = arg0 === null;
    return ret;
}

export function __wbg___wbindgen_is_object_c818261d21f283a4(arg0) {
    const val = arg0;
    const ret = typeof val === "object" && val !== null;
    return ret;
}

export function __wbg___wbindgen_is_string_fbb76cb2940daafd(arg0) {
    const ret = typeof arg0 === "string";
    return ret;
}

export function __wbg___wbindgen_is_undefined_2d472862bd29a478(arg0) {
    const ret = arg0 === undefined;
    return ret;
}

export function __wbg___wbindgen_jsval_eq_6b13ab83478b1c50(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
}

export function __wbg___wbindgen_jsval_loose_eq_b664b38a2f582147(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
}

export function __wbg___wbindgen_number_get_a20bf9b85341449d(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "number" ? obj : undefined;
    getDataViewMemory0().setFloat64(
        arg0 + 8 * 1,
        isLikeNone(ret) ? 0 : ret,
        true,
    );
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}

export function __wbg___wbindgen_string_get_e4f06c90489ad01b(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "string" ? obj : undefined;
    var ptr1 = isLikeNone(ret)
        ? 0
        : passStringToWasm0(
            ret,
            wasm.__wbindgen_malloc,
            wasm.__wbindgen_realloc,
        );
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbg___wbindgen_throw_b855445ff6a94295(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}

export function __wbg__wbg_cb_unref_2454a539ea5790d9(arg0) {
    arg0._wbg_cb_unref();
}

export function __wbg_baseinterfacehandle_new(arg0) {
    const ret = BaseInterfaceHandle.__wrap(arg0);
    return ret;
}

export function __wbg_buffer_ccc4520b36d3ccf4(arg0) {
    const ret = arg0.buffer;
    return ret;
}

export function __wbg_byteLength_bcd42e4025299788(arg0) {
    const ret = arg0.byteLength;
    return ret;
}

export function __wbg_call_357bb72daee10695() {
    return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        const ret = arg0.call(arg1, arg2, arg3, arg4);
        return ret;
    }, arguments);
}

export function __wbg_call_525440f72fbfc0ea() {
    return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments);
}

export function __wbg_call_e45d2cf9fc925fcf() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, arg2, arg3);
        return ret;
    }, arguments);
}

export function __wbg_call_e762c39fa8ea36bf() {
    return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments);
}

export function __wbg_clearTimeout_5a54f8841c30079a(arg0) {
    const ret = clearTimeout(arg0);
    return ret;
}

export function __wbg_close_885e277edf06b3fa() {
    return handleError(function (arg0) {
        arg0.close();
    }, arguments);
}

export function __wbg_createTask_9ac11a42c24ef284() {
    return handleError(function (arg0, arg1) {
        const ret = console.createTask(getStringFromWasm0(arg0, arg1));
        return ret;
    }, arguments);
}

export function __wbg_crypto_f5dce82c355d159f() {
    return handleError(function (arg0) {
        const ret = arg0.crypto;
        return ret;
    }, arguments);
}

export function __wbg_data_ee4306d069f24f2d(arg0) {
    const ret = arg0.data;
    return ret;
}

export function __wbg_debug_f4b0c59db649db48(arg0) {
    console.debug(arg0);
}

export function __wbg_decrypt_45277e4601d6ada4() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.decrypt(arg1, arg2, arg3);
        return ret;
    }, arguments);
}

export function __wbg_deriveBits_28ff8a809aa473ec() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.deriveBits(arg1, arg2, arg3 >>> 0);
        return ret;
    }, arguments);
}

export function __wbg_digest_78c58e89f8153afb() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.digest(arg1, getArrayU8FromWasm0(arg2, arg3));
        return ret;
    }, arguments);
}

export function __wbg_done_2042aa2670fb1db1(arg0) {
    const ret = arg0.done;
    return ret;
}

export function __wbg_encrypt_0ceb389496419d4e() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.encrypt(arg1, arg2, arg3);
        return ret;
    }, arguments);
}

export function __wbg_entries_e171b586f8f6bdbf(arg0) {
    const ret = Object.entries(arg0);
    return ret;
}

export function __wbg_error_7534b8e9a36f1ab4(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
    } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
}

export function __wbg_error_a7f8fbb0523dae15(arg0) {
    console.error(arg0);
}

export function __wbg_exportKey_14f4c9c1691e79dc() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.exportKey(getStringFromWasm0(arg1, arg2), arg3);
        return ret;
    }, arguments);
}

export function __wbg_generateKey_b0e4794bd9d639b0() {
    return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.generateKey(arg1, arg2 !== 0, arg3);
        return ret;
    }, arguments);
}

export function __wbg_getRandomValues_6357e7b583eb49cc() {
    return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.getRandomValues(getArrayU8FromWasm0(arg1, arg2));
        return ret;
    }, arguments);
}

export function __wbg_get_7bed016f185add81(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
}

export function __wbg_get_efcb449f58ec27c2() {
    return handleError(function (arg0, arg1) {
        const ret = Reflect.get(arg0, arg1);
        return ret;
    }, arguments);
}

export function __wbg_get_private_key_0a3a263ca613b0c0(arg0) {
    const ret = arg0.privateKey;
    return ret;
}

export function __wbg_get_public_key_1e2c11d159e34827(arg0) {
    const ret = arg0.publicKey;
    return ret;
}

export function __wbg_get_with_ref_key_1dc361bd10053bfe(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
}

export function __wbg_importKey_2be19189a1451235() {
    return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        const ret = arg0.importKey(
            getStringFromWasm0(arg1, arg2),
            arg3,
            arg4,
            arg5 !== 0,
            arg6,
        );
        return ret;
    }, arguments);
}

export function __wbg_info_e674a11f4f50cc0c(arg0) {
    console.info(arg0);
}

export function __wbg_instanceof_ArrayBuffer_70beb1189ca63b38(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}

export function __wbg_instanceof_CryptoKey_9fbbefded7590b8c(arg0) {
    let result;
    try {
        result = arg0 instanceof CryptoKey;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}

export function __wbg_instanceof_Map_8579b5e2ab5437c7(arg0) {
    let result;
    try {
        result = arg0 instanceof Map;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}

export function __wbg_instanceof_Uint8Array_20c8e73002f7af98(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}

export function __wbg_isArray_96e0af9891d0945d(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
}

export function __wbg_isSafeInteger_d216eda7911dde36(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
}

export function __wbg_iterator_e5822695327a3c39() {
    const ret = Symbol.iterator;
    return ret;
}

export function __wbg_length_69bca3cb64fc8748(arg0) {
    const ret = arg0.length;
    return ret;
}

export function __wbg_length_cdd215e10d9dd507(arg0) {
    const ret = arg0.length;
    return ret;
}

export function __wbg_log_8cec76766b8c0e33(arg0) {
    console.log(arg0);
}

export function __wbg_new_1acc0b6eea89d040() {
    const ret = new Object();
    return ret;
}

export function __wbg_new_3c3d849046688a66(arg0, arg1) {
    try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Function__js_sys_a822dd5f0901d71f___Function_____(
                    a,
                    state0.b,
                    arg0,
                    arg1,
                );
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = state0.b = 0;
    }
}

export function __wbg_new_5a79be3ab53b8aa5(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
}

export function __wbg_new_68651c719dcda04e() {
    const ret = new Map();
    return ret;
}

export function __wbg_new_881c4fe631eee9ad() {
    return handleError(function (arg0, arg1) {
        const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
        return ret;
    }, arguments);
}

export function __wbg_new_8a6f238a6ece86ea() {
    const ret = new Error();
    return ret;
}

export function __wbg_new_e17d9f43105b08be() {
    const ret = new Array();
    return ret;
}

export function __wbg_new_from_slice_92f4d78ca282a2d2(arg0, arg1) {
    const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
    return ret;
}

export function __wbg_new_no_args_ee98eee5275000a4(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
}

export function __wbg_next_020810e0ae8ebcb0() {
    return handleError(function (arg0) {
        const ret = arg0.next();
        return ret;
    }, arguments);
}

export function __wbg_next_2c826fe5dfec6b6a(arg0) {
    const ret = arg0.next;
    return ret;
}

export function __wbg_now_2c95c9de01293173(arg0) {
    const ret = arg0.now();
    return ret;
}

export function __wbg_now_793306c526e2e3b6() {
    const ret = Date.now();
    return ret;
}

export function __wbg_of_035271b9e67a3bd9(arg0) {
    const ret = Array.of(arg0);
    return ret;
}

export function __wbg_of_288d2471f5767a12(arg0, arg1) {
    const ret = Array.of(arg0, arg1);
    return ret;
}

export function __wbg_performance_7a3ffd0b17f663ad(arg0) {
    const ret = arg0.performance;
    return ret;
}

export function __wbg_prototypesetcall_2a6620b6922694b2(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
}

export function __wbg_push_df81a39d04db858c(arg0, arg1) {
    const ret = arg0.push(arg1);
    return ret;
}

export function __wbg_queueMicrotask_34d692c25c47d05b(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
}

export function __wbg_queueMicrotask_9d76cacb20c84d58(arg0) {
    queueMicrotask(arg0);
}

export function __wbg_randomUUID_f5597397f97d1e44(arg0, arg1) {
    const ret = arg1.randomUUID();
    const ptr1 = passStringToWasm0(
        ret,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
    );
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbg_resolve_caf97c30b83f7053(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
}

export function __wbg_run_e5e1ecccf06974b2(arg0, arg1, arg2) {
    try {
        var state0 = { a: arg1, b: arg2 };
        var cb0 = () => {
            const a = state0.a;
            state0.a = 0;
            try {
                return wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___bool_(
                    a,
                    state0.b,
                );
            } finally {
                state0.a = a;
            }
        };
        const ret = arg0.run(cb0);
        return ret;
    } finally {
        state0.a = state0.b = 0;
    }
}

export function __wbg_send_3d2cf376613294f0() {
    return handleError(function (arg0, arg1, arg2) {
        arg0.send(getArrayU8FromWasm0(arg1, arg2));
    }, arguments);
}

export function __wbg_setTimeout_db2dbaeefb6f39c7() {
    return handleError(function (arg0, arg1) {
        const ret = setTimeout(arg0, arg1);
        return ret;
    }, arguments);
}

export function __wbg_set_3f1d0b984ed272ed(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
}

export function __wbg_set_907fb406c34a251d(arg0, arg1, arg2) {
    const ret = arg0.set(arg1, arg2);
    return ret;
}

export function __wbg_set_binaryType_9d839cea8fcdc5c3(arg0, arg1) {
    arg0.binaryType = __wbindgen_enum_BinaryType[arg1];
}

export function __wbg_set_c213c871859d6500(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
}

export function __wbg_set_c2abbebe8b9ebee1() {
    return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(arg0, arg1, arg2);
        return ret;
    }, arguments);
}

export function __wbg_set_counter_8cf891ddbb09c405(arg0, arg1) {
    arg0.counter = arg1;
}

export function __wbg_set_length_9b3abd6e75f20e65(arg0, arg1) {
    arg0.length = arg1;
}

export function __wbg_set_name_30c7450c8511ee95(arg0, arg1, arg2) {
    arg0.name = getStringFromWasm0(arg1, arg2);
}

export function __wbg_set_onclose_c09e4f7422de8dae(arg0, arg1) {
    arg0.onclose = arg1;
}

export function __wbg_set_onerror_337a3a2db9517378(arg0, arg1) {
    arg0.onerror = arg1;
}

export function __wbg_set_onmessage_8661558551a89792(arg0, arg1) {
    arg0.onmessage = arg1;
}

export function __wbg_set_onopen_efccb9305427b907(arg0, arg1) {
    arg0.onopen = arg1;
}

export function __wbg_sign_0077f2aabd37825a() {
    return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        const ret = arg0.sign(arg1, arg2, getArrayU8FromWasm0(arg3, arg4));
        return ret;
    }, arguments);
}

export function __wbg_stack_0ed75d68575b0f3c(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(
        ret,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
    );
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}

export function __wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e() {
    const ret = typeof global === "undefined" ? null : global;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}

export function __wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac() {
    const ret = typeof globalThis === "undefined" ? null : globalThis;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}

export function __wbg_static_accessor_SELF_6fdf4b64710cc91b() {
    const ret = typeof self === "undefined" ? null : self;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}

export function __wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2() {
    const ret = typeof window === "undefined" ? null : window;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}

export function __wbg_subtle_a158c8cba320b8ed(arg0) {
    const ret = arg0.subtle;
    return ret;
}

export function __wbg_then_4f46f6544e6b4a28(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
}

export function __wbg_then_70d05cf780a18d77(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
}

export function __wbg_toString_7da7c8dbec78fcb8(arg0) {
    const ret = arg0.toString();
    return ret;
}

export function __wbg_unwrapKey_91db60c1c1da6b02() {
    return handleError(
        function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
            const ret = arg0.unwrapKey(
                getStringFromWasm0(arg1, arg2),
                arg3,
                arg4,
                getStringFromWasm0(arg5, arg6),
                arg7,
                arg8 !== 0,
                arg9,
            );
            return ret;
        },
        arguments,
    );
}

export function __wbg_value_692627309814bb8c(arg0) {
    const ret = arg0.value;
    return ret;
}

export function __wbg_verify_47e017cd0770194c() {
    return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        const ret = arg0.verify(
            arg1,
            arg2,
            getArrayU8FromWasm0(arg3, arg4),
            getArrayU8FromWasm0(arg5, arg6),
        );
        return ret;
    }, arguments);
}

export function __wbg_warn_1d74dddbe2fd1dbb(arg0) {
    console.warn(arg0);
}

export function __wbg_wrapKey_1b54a5ca6fa71c99() {
    return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        const ret = arg0.wrapKey(
            getStringFromWasm0(arg1, arg2),
            arg3,
            arg4,
            getStringFromWasm0(arg5, arg6),
        );
        return ret;
    }, arguments);
}

export function __wbindgen_cast_0553be6122cd6705(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 253, function: Function { arguments: [NamedExternref("Event")], shim_idx: 246, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut__web_sys_c4adc53b27f2c86___features__gen_Event__Event____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_Event__Event_____,
    );
    return ret;
}

export function __wbindgen_cast_2241b6af4c4b2941(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
}

export function __wbindgen_cast_3a10d06147180825(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 251, function: Function { arguments: [NamedExternref("ErrorEvent")], shim_idx: 244, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut__web_sys_c4adc53b27f2c86___features__gen_ErrorEvent__ErrorEvent____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_ErrorEvent__ErrorEvent_____,
    );
    return ret;
}

export function __wbindgen_cast_3cfb95b465e2c74e(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 252, function: Function { arguments: [NamedExternref("MessageEvent")], shim_idx: 245, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut__web_sys_c4adc53b27f2c86___features__gen_MessageEvent__MessageEvent____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___web_sys_c4adc53b27f2c86___features__gen_MessageEvent__MessageEvent_____,
    );
    return ret;
}

export function __wbindgen_cast_4625c577ab2ec9ee(arg0) {
    // Cast intrinsic for `U64 -> Externref`.
    const ret = BigInt.asUintN(64, arg0);
    return ret;
}

export function __wbindgen_cast_72add29426cd69de(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 2110, function: Function { arguments: [Externref], shim_idx: 2111, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut__wasm_bindgen_a1f4a02d1f896e12___JsValue____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___wasm_bindgen_a1f4a02d1f896e12___JsValue_____,
    );
    return ret;
}

export function __wbindgen_cast_77bc3e92745e9a35(arg0, arg1) {
    var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
    wasm.__wbindgen_free(arg0, arg1 * 1, 1);
    // Cast intrinsic for `Vector(U8) -> Externref`.
    const ret = v0;
    return ret;
}

export function __wbindgen_cast_8e638315f7a5a150(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 2133, function: Function { arguments: [], shim_idx: 2134, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut_____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke______,
    );
    return ret;
}

export function __wbindgen_cast_9943a9a056301f5c(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 250, function: Function { arguments: [NamedExternref("Uint8Array")], shim_idx: 243, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(
        arg0,
        arg1,
        wasm.wasm_bindgen_a1f4a02d1f896e12___closure__destroy___dyn_core_7afadfe777781df7___ops__function__FnMut__js_sys_a822dd5f0901d71f___Uint8Array____Output_______,
        wasm_bindgen_a1f4a02d1f896e12___convert__closures_____invoke___js_sys_a822dd5f0901d71f___Uint8Array_____,
    );
    return ret;
}

export function __wbindgen_cast_9ae0607507abb057(arg0) {
    // Cast intrinsic for `I64 -> Externref`.
    const ret = arg0;
    return ret;
}

export function __wbindgen_cast_d6cd19b81560fd6e(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return ret;
}

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
