import { Plugin, TFolder, Editor, MarkdownView, setIcon } from 'obsidian';

type ToolMode = 'pen' | 'pencil' | 'marker' | 'eraser';
interface CanvasState { data: ImageData; height: number; maxY: number; }

interface SketchSettings {
    color:       string;
    tool:        ToolMode;
    brushSize:   number;
    paperStyle:  string;
    canvasWidth: number;
}

const DEFAULT_SETTINGS: SketchSettings = {
    color:       "#000000",
    tool:        "pen",
    brushSize:   3,
    paperStyle:  "lines",
    canvasWidth: 100,
};

export default class PdfSketchPlugin extends Plugin {
    declare settings: SketchSettings;

    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        this.addCommand({
            id: "insert-pdf-sketch-block",
            name: "Insert PDF Sketch Block",
            editorCallback: (editor: Editor) => {
                editor.replaceSelection("\n```pdf-sketch\n\n```\n");
            }
        });

        this.registerMarkdownCodeBlockProcessor("pdf-sketch", (source, el, ctx) => {
            const container = el.createDiv({ cls: "pdf-sketch-container" });
            const toolbar   = container.createDiv({ cls: "pdf-sketch-toolbar" });

            // ── Tool dropdown ───────────────────────────────────────────────
            const toolSelect = toolbar.createEl("select", { attr: { title: "Drawing tool" } });
            toolSelect.createEl("option", { text: "Pen",    value: "pen" });
            toolSelect.createEl("option", { text: "Pencil", value: "pencil" });
            toolSelect.createEl("option", { text: "Marker", value: "marker" });
            toolSelect.createEl("option", { text: "Eraser", value: "eraser" });
            toolSelect.value = this.settings.tool;
            toolSelect.addEventListener("change", () => {
                this.settings.tool = toolSelect.value as ToolMode;
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });

            // ── Undo / Redo ────────────────────────────────────────────────
            const undoBtn = toolbar.createEl("button", {
                cls: "pdf-sketch-toolbar-btn", attr: { title: "Undo (Ctrl+Z)" }
            });
            setIcon(undoBtn, "undo-2");
            undoBtn.createEl("span", { text: "Undo" });
            undoBtn.disabled = true;

            const redoBtn = toolbar.createEl("button", {
                cls: "pdf-sketch-toolbar-btn", attr: { title: "Redo (Ctrl+Y)" }
            });
            setIcon(redoBtn, "redo-2");
            redoBtn.createEl("span", { text: "Redo" });
            redoBtn.disabled = true;

            toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });

            // ── Color ──────────────────────────────────────────────────────
            const colorInput = toolbar.createEl("input", { type: "color", attr: { title: "Brush color" } });
            colorInput.value = this.settings.color;
            colorInput.addEventListener("change", () => {
                this.settings.color = colorInput.value;
                this.saveData(this.settings);
            });

            // ── Brush size ─────────────────────────────────────────────────
            const widthInput = toolbar.createEl("input", {
                type: "range",
                attr: { min: "1", max: "20", value: String(this.settings.brushSize), title: "Brush size" }
            });
            const widthLabel = toolbar.createEl("span", {
                cls: "pdf-sketch-width-label", text: String(this.settings.brushSize)
            });
            widthInput.addEventListener("input", () => {
                widthLabel.textContent = widthInput.value;
            });
            widthInput.addEventListener("change", () => {
                this.settings.brushSize = parseInt(widthInput.value);
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });

            // ── Paper style ────────────────────────────────────────────────
            const patternSelect = toolbar.createEl("select", { attr: { title: "Paper style" } });
            patternSelect.createEl("option", { text: "Lines",       value: "lines" });
            patternSelect.createEl("option", { text: "Dot Grid",    value: "dots" });
            patternSelect.createEl("option", { text: "Graph",       value: "graph" });
            patternSelect.createEl("option", { text: "Engineering", value: "engineering" });
            patternSelect.createEl("option", { text: "Cornell",     value: "cornell" });
            patternSelect.value = this.settings.paperStyle;
            patternSelect.addEventListener("change", () => {
                this.settings.paperStyle = patternSelect.value;
                this.saveData(this.settings);
                applyCanvasStylePattern();
            });

            toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });

            // ── Canvas width ───────────────────────────────────────────────
            const canvasWidthSlider = toolbar.createEl("input", {
                type: "range",
                attr: { min: "25", max: "100", value: String(this.settings.canvasWidth), step: "5", title: "Canvas width" }
            });
            const canvasWidthLabel = toolbar.createEl("span", {
                cls: "pdf-sketch-pct-label", text: this.settings.canvasWidth + "%"
            });
            canvasWidthSlider.addEventListener("change", () => {
                this.settings.canvasWidth = parseInt(canvasWidthSlider.value);
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: "pdf-sketch-toolbar-sep" });

            // ── Action buttons ─────────────────────────────────────────────
            const clearBtn = toolbar.createEl("button", { cls: "pdf-sketch-toolbar-btn", attr: { title: "Clear canvas" } });
            setIcon(clearBtn, "eraser");
            clearBtn.createEl("span", { text: "Clear" });

            const saveBtn = toolbar.createEl("button", { cls: "pdf-sketch-toolbar-btn", attr: { title: "Save as image" } });
            setIcon(saveBtn, "image-down");
            saveBtn.createEl("span", { text: "Save" });

            // ── Canvas ─────────────────────────────────────────────────────
            const canvas = container.createEl("canvas", { cls: "pdf-sketch-canvas" });

            // ── Delete overlay (bottom-right of canvas) ────────────────────
            const canvasActions  = container.createDiv({ cls: "pdf-sketch-canvas-actions" });
            const deleteBlockBtn = canvasActions.createEl("button", {
                cls: "pdf-sketch-toolbar-btn pdf-sketch-toolbar-btn--danger",
                attr: { title: "Remove sketch block" }
            });
            setIcon(deleteBlockBtn, "trash-2");
            deleteBlockBtn.createEl("span", { text: "Delete" });
            const ctx2d  = canvas.getContext("2d")!;

            const dpr           = window.devicePixelRatio || 1;
            const initialHeight = 300;
            let maxDrawnY       = 0;
            let isSaving        = false;

            const lineSpacing  = 28;
            const graphSpacing = 16;
            const engMajor     = 40;
            const engMinor     = 8;
            const cornellCue   = 30;

            const blue        = "rgba(160, 200, 232, 0.55)";
            const blueDk      = "rgba(100, 155, 200, 0.75)";
            const cornellPink = "rgba(255, 150, 170, 0.85)";

            // ── Pattern rendering ──────────────────────────────────────────
            const applyCanvasStylePattern = () => {
                canvas.style.backgroundImage    = "none";
                canvas.style.backgroundColor    = "transparent";
                canvas.style.backgroundSize     = "";
                canvas.style.backgroundPosition = "";
                const p = patternSelect.value;
                if (p === "lines") {
                    canvas.style.backgroundImage = `linear-gradient(${blue} 1px, transparent 1px)`;
                    canvas.style.backgroundSize  = `100% ${lineSpacing}px`;
                } else if (p === "dots") {
                    canvas.style.backgroundImage = `radial-gradient(${blue} 1.5px, transparent 1.5px)`;
                    canvas.style.backgroundSize  = `${lineSpacing}px ${lineSpacing}px`;
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
                const rect    = canvas.getBoundingClientRect();
                canvas.width  = rect.width * dpr;
                canvas.height = initialHeight * dpr;
                ctx2d.scale(dpr, dpr);
                ctx2d.lineCap  = "round";
                ctx2d.lineJoin = "round";
                applyCanvasStylePattern();
            };

            // Apply saved canvas width before first render
            container.style.width = this.settings.canvasWidth + "%";
            setTimeout(resizeCanvas, 50);

            // ── Undo / Redo ────────────────────────────────────────────────
            const undoStack: CanvasState[] = [];
            const redoStack: CanvasState[] = [];
            const MAX_HISTORY = 20;

            const captureState = (): CanvasState => ({
                data:   ctx2d.getImageData(0, 0, canvas.width, canvas.height),
                height: canvas.height,
                maxY:   maxDrawnY,
            });

            const applyState = (state: CanvasState) => {
                if (canvas.height !== state.height) {
                    canvas.height = state.height;
                    ctx2d.scale(dpr, dpr);
                    ctx2d.lineCap  = "round";
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
                applyState(undoStack.pop()!);
                syncUndoRedo();
            });

            redoBtn.addEventListener("click", () => {
                if (!redoStack.length) return;
                undoStack.push(captureState());
                applyState(redoStack.pop()!);
                syncUndoRedo();
            });

            // ── Canvas width slider ────────────────────────────────────────
            canvasWidthSlider.addEventListener("input", () => {
                const pct = parseInt(canvasWidthSlider.value);
                canvasWidthLabel.textContent = pct + "%";

                const tmp  = document.createElement("canvas");
                tmp.width  = canvas.width;
                tmp.height = canvas.height;
                tmp.getContext("2d")?.drawImage(canvas, 0, 0);
                const savedW = canvas.width  / dpr;
                const savedH = canvas.height / dpr;

                container.style.width = pct + "%";

                requestAnimationFrame(() => {
                    const rect   = canvas.getBoundingClientRect();
                    canvas.width = rect.width * dpr;
                    ctx2d.scale(dpr, dpr);
                    ctx2d.lineCap  = "round";
                    ctx2d.lineJoin = "round";
                    ctx2d.drawImage(tmp, 0, 0, savedW, savedH);
                    applyCanvasStylePattern();
                });
            });

            // ── Drawing ────────────────────────────────────────────────────
            let drawing = false;

            const getPos = (e: PointerEvent) => {
                const r = canvas.getBoundingClientRect();
                return { x: e.clientX - r.left, y: e.clientY - r.top };
            };

            const resolvedTool = (e: PointerEvent): ToolMode =>
                (e.buttons === 32 || e.buttons === 2) ? 'eraser' : toolSelect.value as ToolMode;

            const applyTool = (tool: ToolMode) => {
                const w = parseInt(widthInput.value);
                if (tool === 'eraser') {
                    ctx2d.globalCompositeOperation = "destination-out";
                    ctx2d.globalAlpha = 1.0;
                    ctx2d.lineWidth   = 20;
                } else {
                    ctx2d.globalCompositeOperation = "source-over";
                    ctx2d.strokeStyle = colorInput.value;
                    if (tool === 'pen') {
                        ctx2d.globalAlpha = 1.0;
                        ctx2d.lineWidth   = w;
                    } else if (tool === 'pencil') {
                        ctx2d.globalAlpha = 0.65;
                        ctx2d.lineWidth   = Math.max(1, w * 0.8);
                    } else if (tool === 'marker') {
                        ctx2d.globalAlpha = 0.35;
                        ctx2d.lineWidth   = w * 3;
                    }
                }
            };

            canvas.addEventListener("pointerdown", (e) => {
                if (isSaving) return;
                pushUndo();
                drawing    = true;
                const tool = resolvedTool(e);
                const pos  = getPos(e);
                ctx2d.beginPath();
                ctx2d.moveTo(pos.x, pos.y);
                applyTool(tool);
                if (tool !== 'eraser' && pos.y > maxDrawnY) maxDrawnY = pos.y;
            });

            canvas.addEventListener("pointermove", (e) => {
                if (!drawing || isSaving) return;
                const tool = resolvedTool(e);
                const pos  = getPos(e);
                applyTool(tool);
                ctx2d.lineTo(pos.x, pos.y);
                ctx2d.stroke();
                if (tool !== 'eraser' && pos.y > maxDrawnY) maxDrawnY = pos.y;

                if (pos.y > (canvas.height / dpr) - 20 && tool !== 'eraser') {
                    const ow = canvas.width, oh = canvas.height;
                    const tmp = document.createElement("canvas");
                    tmp.width = ow; tmp.height = oh;
                    tmp.getContext("2d")?.drawImage(canvas, 0, 0);
                    canvas.height = oh + 100 * dpr;
                    ctx2d.scale(dpr, dpr);
                    ctx2d.lineCap  = "round";
                    ctx2d.lineJoin = "round";
                    ctx2d.drawImage(tmp, 0, 0, ow / dpr, oh / dpr);
                }
            });

            const stopDrawing = () => {
                drawing           = false;
                ctx2d.globalAlpha = 1.0;
            };
            canvas.addEventListener("pointerup",    stopDrawing);
            canvas.addEventListener("pointerleave", stopDrawing);

            // ── Clear ──────────────────────────────────────────────────────
            clearBtn.onclick = () => {
                pushUndo();
                ctx2d.globalAlpha              = 1.0;
                ctx2d.globalCompositeOperation = "source-over";
                ctx2d.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
                maxDrawnY = 0;
            };

            // ── Delete block ───────────────────────────────────────────────
            deleteBlockBtn.onclick = async (e) => {
                e.preventDefault();
                const sectionInfo = ctx.getSectionInfo(el);
                if (!sectionInfo) return;
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    view.editor.replaceRange("",
                        { line: sectionInfo.lineStart, ch: 0 },
                        { line: sectionInfo.lineEnd + 1, ch: 0 }
                    );
                }
            };

            // ── Save / export ──────────────────────────────────────────────
            saveBtn.onclick = async (e) => {
                e.preventDefault();
                if (isSaving) return;
                isSaving = true;
                drawing  = false;
                ctx2d.globalAlpha = 1.0;

                const cw      = canvas.width / dpr;
                const pattern = patternSelect.value;
                const trackingSpacing =
                    pattern === "graph"       ? graphSpacing :
                    pattern === "engineering" ? engMajor     : lineSpacing;
                const croppedHeight = Math.max(1, Math.ceil(maxDrawnY / trackingSpacing)) * trackingSpacing;

                const exp    = document.createElement("canvas");
                exp.width    = cw * dpr;
                exp.height   = croppedHeight * dpr;
                const expCtx = exp.getContext("2d")!;
                expCtx.scale(dpr, dpr);

                const lc             = "#b8d4e8";
                const lcs            = "#88aec8";
                const cornellPinkExp = "#ffb0c0";
                expCtx.lineWidth     = 1;

                if (pattern === "lines") {
                    expCtx.strokeStyle = lc;
                    for (let y = lineSpacing; y <= croppedHeight; y += lineSpacing) {
                        expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(cw, y); expCtx.stroke();
                    }
                } else if (pattern === "dots") {
                    expCtx.fillStyle = lc;
                    for (let x = lineSpacing; x < cw;           x += lineSpacing)
                    for (let y = lineSpacing; y < croppedHeight; y += lineSpacing) {
                        expCtx.beginPath(); expCtx.arc(x, y, 1.5, 0, Math.PI * 2); expCtx.fill();
                    }
                } else if (pattern === "graph") {
                    expCtx.strokeStyle = lc;
                    for (let x = graphSpacing; x < cw; x += graphSpacing) {
                        expCtx.beginPath(); expCtx.moveTo(x, 0); expCtx.lineTo(x, croppedHeight); expCtx.stroke();
                    }
                    for (let y = graphSpacing; y <= croppedHeight; y += graphSpacing) {
                        expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(cw, y); expCtx.stroke();
                    }
                } else if (pattern === "engineering") {
                    expCtx.strokeStyle = lc;
                    for (let x = engMinor; x < cw; x += engMinor) {
                        expCtx.beginPath(); expCtx.moveTo(x, 0); expCtx.lineTo(x, croppedHeight); expCtx.stroke();
                    }
                    for (let y = engMinor; y <= croppedHeight; y += engMinor) {
                        expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(cw, y); expCtx.stroke();
                    }
                    expCtx.strokeStyle = lcs;
                    for (let x = engMajor; x < cw; x += engMajor) {
                        expCtx.beginPath(); expCtx.moveTo(x, 0); expCtx.lineTo(x, croppedHeight); expCtx.stroke();
                    }
                    for (let y = engMajor; y <= croppedHeight; y += engMajor) {
                        expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(cw, y); expCtx.stroke();
                    }
                } else if (pattern === "cornell") {
                    expCtx.strokeStyle = lc;
                    for (let y = lineSpacing; y <= croppedHeight; y += lineSpacing) {
                        expCtx.beginPath(); expCtx.moveTo(0, y); expCtx.lineTo(cw, y); expCtx.stroke();
                    }
                    expCtx.strokeStyle = cornellPinkExp;
                    const cueX = cw * (cornellCue / 100);
                    expCtx.beginPath(); expCtx.moveTo(cueX, 0); expCtx.lineTo(cueX, croppedHeight); expCtx.stroke();
                }

                expCtx.drawImage(canvas, 0, 0, cw, canvas.height / dpr);

                const data       = exp.toDataURL("image/png").split(',')[1];
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) { isSaving = false; return; }

                let parentPath = activeFile.parent?.path ?? "";
                if (parentPath === "/" || parentPath.trim() === "") parentPath = "";

                const sketchFolder = parentPath ? `${parentPath}/sketches` : "sketches";
                if (!(this.app.vault.getAbstractFileByPath(sketchFolder) instanceof TFolder)) {
                    await this.app.vault.createFolder(sketchFolder);
                }

                const fileName = `${sketchFolder}/sketch-${Date.now()}.png`;
                await this.app.vault.createBinary(fileName,
                    Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer);

                this.app.workspace.activeEditor?.editor
                    ?.replaceRange(`\n![[${fileName}]]\n`,
                        this.app.workspace.activeEditor.editor.getCursor());

                setTimeout(() => { container.remove(); }, 50);
            };
        });
    }
}
