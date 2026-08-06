//#region src/editor/binary-preview.ts
var e = class {
	element;
	constructor(e) {
		this.element = e;
	}
	isVisible() {
		return this.element.style.display !== "none";
	}
	show() {
		this.element.style.display = "flex";
	}
	hide() {
		this.element.style.display = "none", this.element.innerHTML = "";
	}
	shouldSuppressModelChange(e, t) {
		return this.isVisible() && e === t;
	}
};
//#endregion
export { e as BinaryPreviewController };
