"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PdfSketchPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  color: "#000000",
  tool: "pen",
  brushSize: 3,
  paperStyle: "lines",
  canvasWidth: 100
};
var PdfSketchPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings");
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addCommand({
      id: "insert-pdf-sketch-block",
      name: "Insert PDF Sketch Block",
      editorCallback: (editor) => {
        editor.replaceSelection("\n```raster-sketch\n\n```\n");
      }
    });
    this.registerMarkdownCodeBlockProcessor("pdf-sketch", (source, el, ctx) => {
      const container = el.createDiv({ cls: "pdf-sketch-container" });
      const toolbar = container.createDiv({ cls: "pdf-sketch-toolbar" });
      const toolSelect = toolbar.createEl("select", { attr: { title: "Drawing tool" } });
      toolSelect.createEl("option", { text: "Pen", value: "pen" });
      toolSelect.createEl("option", { text: "Pencil", value: "pencil" });
      toolSelect.createEl("option", { text: "Marker", value: "marker" });
      toolSelect.createEl("option", { text: "Eraser", value: "eraser" });
      toolSelect.value = this.settings.tool;
      toolSelect.addEventListener("change", () => {
        this.settings.tool = toolSelect.value;
        this.saveData(this.settings);
      });
      toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });
      const undoBtn = toolbar.createEl("button", {
        cls: "pdf-sketch-toolbar-btn",
        attr: { title: "Undo (Ctrl+Z)" }
      });
      (0, import_obsidian.setIcon)(undoBtn, "undo-2");
      undoBtn.createEl("span", { text: "Undo" });
      undoBtn.disabled = true;
      const redoBtn = toolbar.createEl("button", {
        cls: "pdf-sketch-toolbar-btn",
        attr: { title: "Redo (Ctrl+Y)" }
      });
      (0, import_obsidian.setIcon)(redoBtn, "redo-2");
      redoBtn.createEl("span", { text: "Redo" });
      redoBtn.disabled = true;
      toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });
      const colorInput = toolbar.createEl("input", { type: "color", attr: { title: "Brush color" } });
      colorInput.value = this.settings.color;
      colorInput.addEventListener("change", () => {
        this.settings.color = colorInput.value;
        this.saveData(this.settings);
      });
      const widthInput = toolbar.createEl("input", {
        type: "range",
        attr: { min: "1", max: "20", value: String(this.settings.brushSize), title: "Brush size" }
      });
      const widthLabel = toolbar.createEl("span", {
        cls: "pdf-sketch-width-label",
        text: String(this.settings.brushSize)
      });
      widthInput.addEventListener("input", () => {
        widthLabel.textContent = widthInput.value;
      });
      widthInput.addEventListener("change", () => {
        this.settings.brushSize = parseInt(widthInput.value);
        this.saveData(this.settings);
      });
      toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });
      const patternSelect = toolbar.createEl("select", { attr: { title: "Paper style" } });
      patternSelect.createEl("option", { text: "Lines", value: "lines" });
      patternSelect.createEl("option", { text: "Dot Grid", value: "dots" });
      patternSelect.createEl("option", { text: "Graph", value: "graph" });
      patternSelect.createEl("option", { text: "Engineering", value: "engineering" });
      patternSelect.createEl("option", { text: "Cornell", value: "cornell" });
      patternSelect.value = this.settings.paperStyle;
      patternSelect.addEventListener("change", () => {
        this.settings.paperStyle = patternSelect.value;
        this.saveData(this.settings);
        applyCanvasStylePattern();
      });
      toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });
      const canvasWidthSlider = toolbar.createEl("input", {
        type: "range",
        attr: { min: "25", max: "100", value: String(this.settings.canvasWidth), step: "5", title: "Canvas width" }
      });
      const canvasWidthLabel = toolbar.createEl("span", {
        cls: "pdf-sketch-pct-label",
        text: this.settings.canvasWidth + "%"
      });
      canvasWidthSlider.addEventListener("change", () => {
        this.settings.canvasWidth = parseInt(canvasWidthSlider.value);
        this.saveData(this.settings);
      });
      toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });
      const clearBtn = toolbar.createEl("button", { cls: "pdf-sketch-toolbar-btn", attr: { title: "Clear canvas" } });
      (0, import_obsidian.setIcon)(clearBtn, "eraser");
      clearBtn.createEl("span", { text: "Clear" });
      const saveBtn = toolbar.createEl("button", { cls: "pdf-sketch-toolbar-btn", attr: { title: "Save as image" } });
      (0, import_obsidian.setIcon)(saveBtn, "image-down");
      saveBtn.createEl("span", { text: "Save" });
      const canvas = container.createEl("canvas", { cls: "pdf-sketch-canvas" });
      const canvasActions = container.createDiv({ cls: "pdf-sketch-canvas-actions" });
      const deleteBlockBtn = canvasActions.createEl("button", {
        cls: "pdf-sketch-toolbar-btn pdf-sketch-toolbar-btn--danger",
        attr: { title: "Remove sketch block" }
      });
      (0, import_obsidian.setIcon)(deleteBlockBtn, "trash-2");
      deleteBlockBtn.createEl("span", { text: "Delete" });
      const ctx2d = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const initialHeight = 300;
      let maxDrawnY = 0;
      let isSaving = false;
      const lineSpacing = 28;
      const graphSpacing = 16;
      const engMajor = 40;
      const engMinor = 8;
      const cornellCue = 30;
      const blue = "rgba(160, 200, 232, 0.55)";
      const blueDk = "rgba(100, 155, 200, 0.75)";
      const cornellPink = "rgba(255, 150, 170, 0.85)";
      const applyCanvasStylePattern = () => {
        canvas.style.backgroundImage = "none";
        canvas.style.backgroundColor = "transparent";
        canvas.style.backgroundSize = "";
        canvas.style.backgroundPosition = "";
        const p = patternSelect.value;
        if (p === "lines") {
          canvas.style.backgroundImage = `linear-gradient(${blue} 1px, transparent 1px)`;
          canvas.style.backgroundSize = `100% ${lineSpacing}px`;
        } else if (p === "dots") {
          canvas.style.backgroundImage = `radial-gradient(${blue} 1.5px, transparent 1.5px)`;
          canvas.style.backgroundSize = `${lineSpacing}px ${lineSpacing}px`;
        } else if (p === "graph") {
          canvas.style.backgroundImage = [
            `linear-gradient(${blue} 1px, transparent 1px)`,
            `linear-gradient(90deg, ${blue} 1px, transparent 1px)`
          ].join(", ");
          canvas.style.backgroundSize = `${graphSpacing}px ${graphSpacing}px`;
        } else if (p === "engineering") {
          canvas.style.backgroundImage = [
            `linear-gradient(${blueDk} 1px, transparent 1px)`,
            `linear-gradient(90deg, ${blueDk} 1px, transparent 1px)`,
            `linear-gradient(${blue} 1px, transparent 1px)`,
            `linear-gradient(90deg, ${blue} 1px, transparent 1px)`
          ].join(", ");
          canvas.style.backgroundSize = [
            `${engMajor}px ${engMajor}px`,
            `${engMajor}px ${engMajor}px`,
            `${engMinor}px ${engMinor}px`,
            `${engMinor}px ${engMinor}px`
          ].join(", ");
        } else if (p === "cornell") {
          canvas.style.backgroundImage = [
            `linear-gradient(${blue} 1px, transparent 1px)`,
            `linear-gradient(90deg,
                            transparent calc(${cornellCue}% - 0.5px),
                            ${cornellPink} calc(${cornellCue}% - 0.5px),
                            ${cornellPink} calc(${cornellCue}% + 0.5px),
                            transparent calc(${cornellCue}% + 0.5px))`
          ].join(", ");
          canvas.style.backgroundSize = `100% ${lineSpacing}px, 100% 100%`;
        }
      };
      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = initialHeight * dpr;
        ctx2d.scale(dpr, dpr);
        ctx2d.lineCap = "round";
        ctx2d.lineJoin = "round";
        applyCanvasStylePattern();
      };
      container.style.width = this.settings.canvasWidth + "%";
      setTimeout(resizeCanvas, 50);
      const undoStack = [];
      const redoStack = [];
      const MAX_HISTORY = 20;
      const captureState = () => ({
        data: ctx2d.getImageData(0, 0, canvas.width, canvas.height),
        height: canvas.height,
        maxY: maxDrawnY
      });
      const applyState = (state) => {
        if (canvas.height !== state.height) {
          canvas.height = state.height;
          ctx2d.scale(dpr, dpr);
          ctx2d.lineCap = "round";
          ctx2d.lineJoin = "round";
        }
        ctx2d.putImageData(state.data, 0, 0);
        maxDrawnY = state.maxY;
      };
      const syncUndoRedo = () => {
        undoBtn.disabled = undoStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
      };
      const pushUndo = () => {
        undoStack.push(captureState());
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        syncUndoRedo();
      };
      undoBtn.addEventListener("click", () => {
        if (!undoStack.length) return;
        redoStack.push(captureState());
        applyState(undoStack.pop());
        syncUndoRedo();
      });
      redoBtn.addEventListener("click", () => {
        if (!redoStack.length) return;
        undoStack.push(captureState());
        applyState(redoStack.pop());
        syncUndoRedo();
      });
      canvasWidthSlider.addEventListener("input", () => {
        var _a;
        const pct = parseInt(canvasWidthSlider.value);
        canvasWidthLabel.textContent = pct + "%";
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        (_a = tmp.getContext("2d")) == null ? void 0 : _a.drawImage(canvas, 0, 0);
        const savedW = canvas.width / dpr;
        const savedH = canvas.height / dpr;
        container.style.width = pct + "%";
        requestAnimationFrame(() => {
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          ctx2d.scale(dpr, dpr);
          ctx2d.lineCap = "round";
          ctx2d.lineJoin = "round";
          ctx2d.drawImage(tmp, 0, 0, savedW, savedH);
          applyCanvasStylePattern();
        });
      });
      let drawing = false;
      const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const resolvedTool = (e) => e.buttons === 32 || e.buttons === 2 ? "eraser" : toolSelect.value;
      const applyTool = (tool) => {
        const w = parseInt(widthInput.value);
        if (tool === "eraser") {
          ctx2d.globalCompositeOperation = "destination-out";
          ctx2d.globalAlpha = 1;
          ctx2d.lineWidth = 20;
        } else {
          ctx2d.globalCompositeOperation = "source-over";
          ctx2d.strokeStyle = colorInput.value;
          if (tool === "pen") {
            ctx2d.globalAlpha = 1;
            ctx2d.lineWidth = w;
          } else if (tool === "pencil") {
            ctx2d.globalAlpha = 0.65;
            ctx2d.lineWidth = Math.max(1, w * 0.8);
          } else if (tool === "marker") {
            ctx2d.globalAlpha = 0.35;
            ctx2d.lineWidth = w * 3;
          }
        }
      };
      canvas.addEventListener("pointerdown", (e) => {
        if (isSaving) return;
        pushUndo();
        drawing = true;
        const tool = resolvedTool(e);
        const pos = getPos(e);
        ctx2d.beginPath();
        ctx2d.moveTo(pos.x, pos.y);
        applyTool(tool);
        if (tool !== "eraser" && pos.y > maxDrawnY) maxDrawnY = pos.y;
      });
      canvas.addEventListener("pointermove", (e) => {
        var _a;
        if (!drawing || isSaving) return;
        const tool = resolvedTool(e);
        const pos = getPos(e);
        applyTool(tool);
        ctx2d.lineTo(pos.x, pos.y);
        ctx2d.stroke();
        if (tool !== "eraser" && pos.y > maxDrawnY) maxDrawnY = pos.y;
        if (pos.y > canvas.height / dpr - 20 && tool !== "eraser") {
          const ow = canvas.width, oh = canvas.height;
          const tmp = document.createElement("canvas");
          tmp.width = ow;
          tmp.height = oh;
          (_a = tmp.getContext("2d")) == null ? void 0 : _a.drawImage(canvas, 0, 0);
          canvas.height = oh + 100 * dpr;
          ctx2d.scale(dpr, dpr);
          ctx2d.lineCap = "round";
          ctx2d.lineJoin = "round";
          ctx2d.drawImage(tmp, 0, 0, ow / dpr, oh / dpr);
        }
      });
      const stopDrawing = () => {
        drawing = false;
        ctx2d.globalAlpha = 1;
      };
      canvas.addEventListener("pointerup", stopDrawing);
      canvas.addEventListener("pointerleave", stopDrawing);
      clearBtn.onclick = () => {
        pushUndo();
        ctx2d.globalAlpha = 1;
        ctx2d.globalCompositeOperation = "source-over";
        ctx2d.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        maxDrawnY = 0;
      };
      deleteBlockBtn.onclick = async (e) => {
        e.preventDefault();
        const sectionInfo = ctx.getSectionInfo(el);
        if (!sectionInfo) return;
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (view) {
          view.editor.replaceRange(
            "",
            { line: sectionInfo.lineStart, ch: 0 },
            { line: sectionInfo.lineEnd + 1, ch: 0 }
          );
        }
      };
      saveBtn.onclick = async (e) => {
        var _a, _b, _c, _d;
        e.preventDefault();
        if (isSaving) return;
        isSaving = true;
        drawing = false;
        ctx2d.globalAlpha = 1;
        const cw = canvas.width / dpr;
        const pattern = patternSelect.value;
        const trackingSpacing = pattern === "graph" ? graphSpacing : pattern === "engineering" ? engMajor : lineSpacing;
        const croppedHeight = Math.max(1, Math.ceil(maxDrawnY / trackingSpacing)) * trackingSpacing;
        const exp = document.createElement("canvas");
        exp.width = cw * dpr;
        exp.height = croppedHeight * dpr;
        const expCtx = exp.getContext("2d");
        expCtx.scale(dpr, dpr);
        const lc = "#b8d4e8";
        const lcs = "#88aec8";
        const cornellPinkExp = "#ffb0c0";
        expCtx.lineWidth = 1;
        if (pattern === "lines") {
          expCtx.strokeStyle = lc;
          for (let y = lineSpacing; y <= croppedHeight; y += lineSpacing) {
            expCtx.beginPath();
            expCtx.moveTo(0, y);
            expCtx.lineTo(cw, y);
            expCtx.stroke();
          }
        } else if (pattern === "dots") {
          expCtx.fillStyle = lc;
          for (let x = lineSpacing; x < cw; x += lineSpacing)
            for (let y = lineSpacing; y < croppedHeight; y += lineSpacing) {
              expCtx.beginPath();
              expCtx.arc(x, y, 1.5, 0, Math.PI * 2);
              expCtx.fill();
            }
        } else if (pattern === "graph") {
          expCtx.strokeStyle = lc;
          for (let x = graphSpacing; x < cw; x += graphSpacing) {
            expCtx.beginPath();
            expCtx.moveTo(x, 0);
            expCtx.lineTo(x, croppedHeight);
            expCtx.stroke();
          }
          for (let y = graphSpacing; y <= croppedHeight; y += graphSpacing) {
            expCtx.beginPath();
            expCtx.moveTo(0, y);
            expCtx.lineTo(cw, y);
            expCtx.stroke();
          }
        } else if (pattern === "engineering") {
          expCtx.strokeStyle = lc;
          for (let x = engMinor; x < cw; x += engMinor) {
            expCtx.beginPath();
            expCtx.moveTo(x, 0);
            expCtx.lineTo(x, croppedHeight);
            expCtx.stroke();
          }
          for (let y = engMinor; y <= croppedHeight; y += engMinor) {
            expCtx.beginPath();
            expCtx.moveTo(0, y);
            expCtx.lineTo(cw, y);
            expCtx.stroke();
          }
          expCtx.strokeStyle = lcs;
          for (let x = engMajor; x < cw; x += engMajor) {
            expCtx.beginPath();
            expCtx.moveTo(x, 0);
            expCtx.lineTo(x, croppedHeight);
            expCtx.stroke();
          }
          for (let y = engMajor; y <= croppedHeight; y += engMajor) {
            expCtx.beginPath();
            expCtx.moveTo(0, y);
            expCtx.lineTo(cw, y);
            expCtx.stroke();
          }
        } else if (pattern === "cornell") {
          expCtx.strokeStyle = lc;
          for (let y = lineSpacing; y <= croppedHeight; y += lineSpacing) {
            expCtx.beginPath();
            expCtx.moveTo(0, y);
            expCtx.lineTo(cw, y);
            expCtx.stroke();
          }
          expCtx.strokeStyle = cornellPinkExp;
          const cueX = cw * (cornellCue / 100);
          expCtx.beginPath();
          expCtx.moveTo(cueX, 0);
          expCtx.lineTo(cueX, croppedHeight);
          expCtx.stroke();
        }
        expCtx.drawImage(canvas, 0, 0, cw, canvas.height / dpr);
        const data = exp.toDataURL("image/png").split(",")[1];
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          isSaving = false;
          return;
        }
        let parentPath = (_b = (_a = activeFile.parent) == null ? void 0 : _a.path) != null ? _b : "";
        if (parentPath === "/" || parentPath.trim() === "") parentPath = "";
        const sketchFolder = parentPath ? `${parentPath}/sketches` : "sketches";
        if (!(this.app.vault.getAbstractFileByPath(sketchFolder) instanceof import_obsidian.TFolder)) {
          await this.app.vault.createFolder(sketchFolder);
        }
        const fileName = `${sketchFolder}/sketch-${Date.now()}.png`;
        await this.app.vault.createBinary(
          fileName,
          Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer
        );
        (_d = (_c = this.app.workspace.activeEditor) == null ? void 0 : _c.editor) == null ? void 0 : _d.replaceRange(
          `
![[${fileName}]]
`,
          this.app.workspace.activeEditor.editor.getCursor()
        );
        setTimeout(() => {
          container.remove();
        }, 50);
      };
    });
  }
};
