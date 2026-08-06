//#region src/engine/wasm-features.ts
var e = new Uint8Array([
	0,
	97,
	115,
	109,
	1,
	0,
	0,
	0,
	1,
	5,
	1,
	96,
	0,
	1,
	123,
	3,
	2,
	1,
	0,
	10,
	8,
	1,
	6,
	0,
	65,
	0,
	253,
	15,
	11
]);
function t() {
	try {
		return typeof WebAssembly == "object" && WebAssembly.validate(e);
	} catch {
		return !1;
	}
}
//#endregion
export { t as wasmSimdSupported };
