import { Plugin, TFile, setIcon } from 'obsidian';
import { PDFDocument } from 'pdf-lib';

type ToolMode = 'pen' | 'pencil' | 'marker' | 'highlighter' | 'eraser';

interface SketchSettings {
    color:     string;
    tool:      ToolMode;
    brushSize: number;
    snapLines: boolean;
}

const DEFAULT_SETTINGS: SketchSettings = {
    color:     '#000000',
    tool:      'pen',
    brushSize: 3,
    snapLines: false,
};

export default class PdfSketchPlugin extends Plugin {
    declare settings: SketchSettings;

    async onload() {
        console.log('[pdf-sketch] plugin loading');
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        console.log('[pdf-sketch] registering code block processor');

        this.registerMarkdownCodeBlockProcessor('pdf-sketch', async (source, el, ctx) => {
            console.log('[pdf-sketch] processor fired, source:', source);
            const match = source.trim().match(/\[\[(.+?)\]\]/);
            if (!match) {
                console.log('[pdf-sketch] no wikilink found');
                el.createEl('p', { cls: 'pdf-sketch-error', text: 'Usage: [[path/to/file.pdf]]' });
                return;
            }

            console.log('[pdf-sketch] looking up file:', match[1]);
            const file = this.app.metadataCache.getFirstLinkpathDest(match[1], ctx.sourcePath);
            if (!(file instanceof TFile)) {
                console.log('[pdf-sketch] file not found:', match[1]);
                el.createEl('p', { cls: 'pdf-sketch-error', text: `File not found: ${match[1]}` });
                return;
            }
            console.log('[pdf-sketch] file found:', file.path);

            // Lazy-load pdfjs so a crash here doesn't prevent the plugin from loading
            let pdfjsLib: typeof import('pdfjs-dist');
            try {
                pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
                // Inline worker as a blob URL so no separate worker file is needed
                const workerB64: string = require('pdf-worker-inline');
                const workerSrc = atob(workerB64);
                const blob = new Blob([workerSrc], { type: 'application/javascript' });
                pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
                console.log('[pdf-sketch] pdfjs loaded');
            } catch (e) {
                console.error('[pdf-sketch] failed to load pdfjs:', e);
                el.createEl('p', { cls: 'pdf-sketch-error', text: 'Failed to load PDF renderer: ' + e });
                return;
            }

            const container = el.createDiv({ cls: 'pdf-sketch-container' });

            // ── Toolbar ──────────────────────────────────────────────────────
            const toolbar = container.createDiv({ cls: 'pdf-sketch-toolbar' });

            const toolSelect = toolbar.createEl('select', { attr: { title: 'Drawing tool' } });
            (['pen', 'pencil', 'marker', 'highlighter', 'eraser'] as ToolMode[]).forEach(t =>
                toolSelect.createEl('option', { text: t[0].toUpperCase() + t.slice(1), value: t })
            );
            toolSelect.value = this.settings.tool;
            toolSelect.addEventListener('change', () => {
                this.settings.tool = toolSelect.value as ToolMode;
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: 'pdf-sketch-toolbar-sep' });

            const snapBtn = toolbar.createEl('button', {
                cls: 'pdf-sketch-toolbar-btn' + (this.settings.snapLines ? ' pdf-sketch-toolbar-btn--active' : ''),
                attr: { title: 'Snap lines to 90°' },
            });
            setIcon(snapBtn, 'ruler');
            snapBtn.createEl('span', { text: '90°' });
            snapBtn.addEventListener('click', () => {
                this.settings.snapLines = !this.settings.snapLines;
                snapBtn.toggleClass('pdf-sketch-toolbar-btn--active', this.settings.snapLines);
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: 'pdf-sketch-toolbar-sep' });

            const undoBtn = toolbar.createEl('button', { cls: 'pdf-sketch-toolbar-btn', attr: { title: 'Undo (Ctrl+Z)' } });
            setIcon(undoBtn, 'undo-2');
            undoBtn.createEl('span', { text: 'Undo' });
            undoBtn.disabled = true;

            const redoBtn = toolbar.createEl('button', { cls: 'pdf-sketch-toolbar-btn', attr: { title: 'Redo (Ctrl+Y)' } });
            setIcon(redoBtn, 'redo-2');
            redoBtn.createEl('span', { text: 'Redo' });
            redoBtn.disabled = true;

            toolbar.createDiv({ cls: 'pdf-sketch-toolbar-sep' });

            const colorInput = toolbar.createEl('input', { type: 'color', attr: { title: 'Brush color' } });
            colorInput.value = this.settings.color;
            colorInput.addEventListener('change', () => {
                this.settings.color = colorInput.value;
                this.saveData(this.settings);
            });

            const brushInput = toolbar.createEl('input', {
                type: 'range',
                attr: { min: '1', max: '20', value: String(this.settings.brushSize), title: 'Brush size' }
            });
            const brushLabel = toolbar.createEl('span', { cls: 'pdf-sketch-width-label', text: String(this.settings.brushSize) });
            brushInput.addEventListener('input',  () => brushLabel.textContent = brushInput.value);
            brushInput.addEventListener('change', () => {
                this.settings.brushSize = parseInt(brushInput.value);
                this.saveData(this.settings);
            });

            toolbar.createDiv({ cls: 'pdf-sketch-toolbar-spacer' });

            const saveBtn = toolbar.createEl('button', { cls: 'pdf-sketch-toolbar-btn pdf-sketch-toolbar-btn--save', attr: { title: 'Flatten and save to PDF' } });
            setIcon(saveBtn, 'save');
            saveBtn.createEl('span', { text: 'Save' });

            // ── Sticky toolbar ────────────────────────────────────────────────
            // Obsidian ancestors may have CSS transforms which break
            // position:fixed. Move the toolbar onto document.body when fixed
            // so it escapes any transformed ancestor.
            const toolbarSentinel = container.createDiv();
            toolbarSentinel.style.height = '1px';
            container.insertBefore(toolbarSentinel, toolbar);

            const toolbarPlaceholder = container.createDiv();
            toolbarPlaceholder.style.height = '0';
            container.insertBefore(toolbarPlaceholder, toolbar.nextSibling);

            let toolbarFixed = false;

            const fixToolbar = () => {
                const cr = container.getBoundingClientRect();
                document.body.appendChild(toolbar);
                Object.assign(toolbar.style, {
                    position: 'fixed',
                    top: '0px',
                    left: cr.left + 'px',
                    width: cr.width + 'px',
                    zIndex: '9999',
                });
                toolbarPlaceholder.style.height = '38px';
            };

            const unfixToolbar = () => {
                container.insertBefore(toolbar, toolbarPlaceholder);
                Object.assign(toolbar.style, {
                    position: '', top: '', left: '', width: '', zIndex: '',
                });
                toolbarPlaceholder.style.height = '0';
            };

            // Keep width in sync if the container is resized while fixed
            const resizeObserver = new ResizeObserver(() => {
                if (toolbarFixed) fixToolbar();
            });
            resizeObserver.observe(container);

            const stickyObserver = new IntersectionObserver(([entry]) => {
                const shouldFix = !entry.isIntersecting && entry.boundingClientRect.top < 0;
                if (shouldFix === toolbarFixed) return;
                toolbarFixed = shouldFix;
                shouldFix ? fixToolbar() : unfixToolbar();
            }, { threshold: 0 });
            stickyObserver.observe(toolbarSentinel);

            this.register(() => {
                stickyObserver.disconnect();
                resizeObserver.disconnect();
                // Return toolbar to container if it was moved to body
                if (toolbarFixed) unfixToolbar();
            });

            // ── Pages area ───────────────────────────────────────────────────
            const pagesEl = container.createDiv({ cls: 'pdf-sketch-pages' });

            // ── Load PDF ─────────────────────────────────────────────────────
            let pdfBytes: ArrayBuffer;
            try {
                pdfBytes = await this.app.vault.readBinary(file);
                console.log('[pdf-sketch] read PDF bytes:', pdfBytes.byteLength);
            } catch (e) {
                console.error('[pdf-sketch] failed to read file:', e);
                pagesEl.createEl('p', { cls: 'pdf-sketch-error', text: 'Could not read PDF file.' });
                return;
            }

            // pdfjs transfers the ArrayBuffer to its worker, detaching it.
            // Keep a separate copy for pdf-lib to use when saving.
            const pdfBytesForSave = pdfBytes.slice(0);

            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
            let pdf: any;
            try {
                pdf = await loadingTask.promise;
                console.log('[pdf-sketch] PDF loaded, pages:', pdf.numPages);
            } catch (e) {
                console.error('[pdf-sketch] failed to parse PDF:', e);
                pagesEl.createEl('p', { cls: 'pdf-sketch-error', text: 'Could not parse PDF.' });
                return;
            }

            // ── Render pages ─────────────────────────────────────────────────
            const drawCanvases: HTMLCanvasElement[] = [];

            // Per-page undo/redo stacks
            const undoStacks: ImageData[][] = [];
            const redoStacks: ImageData[][] = [];

            const syncUndoRedo = (pageIdx: number) => {
                undoBtn.disabled = undoStacks[pageIdx].length === 0;
                redoBtn.disabled = redoStacks[pageIdx].length === 0;
            };

            let activePage = 0;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page     = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });

                const wrapper = pagesEl.createDiv({ cls: 'pdf-sketch-page-wrapper' });

                // PDF render canvas (background, read-only)
                const pdfCanvas    = wrapper.createEl('canvas', { cls: 'pdf-sketch-pdf-canvas' });
                pdfCanvas.width    = viewport.width;
                pdfCanvas.height   = viewport.height;
                pdfCanvas.style.width  = '100%';
                pdfCanvas.style.height = 'auto';

                await page.render({ canvasContext: pdfCanvas.getContext('2d')!, viewport }).promise;

                // Drawing canvas (transparent overlay)
                const drawCanvas    = wrapper.createEl('canvas', { cls: 'pdf-sketch-draw-canvas' });
                drawCanvas.width    = viewport.width;
                drawCanvas.height   = viewport.height;
                drawCanvas.style.width  = '100%';
                drawCanvas.style.height = 'auto';

                drawCanvases.push(drawCanvas);
                undoStacks.push([]);
                redoStacks.push([]);

                const pageIdx = i - 1;

                // Focus tracking for undo/redo buttons
                drawCanvas.addEventListener('pointerdown', () => {
                    activePage = pageIdx;
                    syncUndoRedo(pageIdx);
                });

                this.attachDrawing(drawCanvas, pageIdx, toolSelect, colorInput, brushInput,
                    undoStacks, redoStacks, () => syncUndoRedo(pageIdx), snapBtn);
            }

            // ── Undo / Redo button handlers ───────────────────────────────────
            undoBtn.addEventListener('click', () => {
                const stack = undoStacks[activePage];
                if (!stack.length) return;
                const ctx = drawCanvases[activePage].getContext('2d')!;
                redoStacks[activePage].push(ctx.getImageData(0, 0, drawCanvases[activePage].width, drawCanvases[activePage].height));
                ctx.putImageData(stack.pop()!, 0, 0);
                syncUndoRedo(activePage);
            });

            redoBtn.addEventListener('click', () => {
                const stack = redoStacks[activePage];
                if (!stack.length) return;
                const ctx = drawCanvases[activePage].getContext('2d')!;
                undoStacks[activePage].push(ctx.getImageData(0, 0, drawCanvases[activePage].width, drawCanvases[activePage].height));
                ctx.putImageData(stack.pop()!, 0, 0);
                syncUndoRedo(activePage);
            });

            // ── Save ──────────────────────────────────────────────────────────
            saveBtn.addEventListener('click', async () => {
                saveBtn.disabled = true;
                saveBtn.setText('Saving…');
                try {
                    await this.flattenAndSave(file, pdfBytesForSave, drawCanvases);
                    saveBtn.setText('Saved!');
                    setTimeout(() => {
                        saveBtn.disabled = false;
                        const span = saveBtn.querySelector('span');
                        if (span) span.textContent = 'Save';
                    }, 1500);
                } catch (e) {
                    console.error('pdf-sketch save error', e);
                    saveBtn.setText('Error: ' + (e instanceof Error ? e.message : String(e)));
                    saveBtn.disabled = false;
                }
            });
        });
    }

    private attachDrawing(
        canvas:      HTMLCanvasElement,
        pageIdx:     number,
        toolSelect:  HTMLSelectElement,
        colorInput:  HTMLInputElement,
        brushInput:  HTMLInputElement,
        undoStacks:  ImageData[][],
        redoStacks:  ImageData[][],
        onStroke:    () => void,
        snapBtn:     HTMLButtonElement,
    ) {
        const ctx2d = canvas.getContext('2d')!;
        ctx2d.lineCap  = 'round';
        ctx2d.lineJoin = 'round';

        let drawing = false;
        let startPos = { x: 0, y: 0 };
        let preStrokeSnapshot: ImageData | null = null;
        let strokePoints: { x: number; y: number }[] = [];

        const cssToCanvas = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) * (canvas.width  / r.width),
                y: (e.clientY - r.top)  * (canvas.height / r.height),
            };
        };

        const applyTool = (tool: ToolMode, w: number) => {
            if (tool === 'eraser') {
                ctx2d.globalCompositeOperation = 'destination-out';
                ctx2d.globalAlpha = 1;
                ctx2d.lineWidth   = 20;
                ctx2d.lineCap     = 'round';
            } else {
                ctx2d.globalCompositeOperation = 'source-over';
                ctx2d.strokeStyle = colorInput.value;
                if (tool === 'pen') {
                    ctx2d.globalAlpha = 1;
                    ctx2d.lineWidth   = w;
                    ctx2d.lineCap     = 'round';
                } else if (tool === 'pencil') {
                    ctx2d.globalAlpha = 0.65;
                    ctx2d.lineWidth   = Math.max(1, w * 0.8);
                    ctx2d.lineCap     = 'round';
                } else if (tool === 'marker') {
                    ctx2d.globalAlpha = 0.35;
                    ctx2d.lineWidth   = w * 3;
                    ctx2d.lineCap     = 'round';
                } else if (tool === 'highlighter') {
                    ctx2d.globalAlpha = 0.4;
                    ctx2d.lineWidth   = w * 4;
                    ctx2d.lineCap     = 'square';
                }
            }
        };

        const getTool = (e: PointerEvent): ToolMode =>
            (e.buttons === 32 || e.buttons === 2) ? 'eraser' : toolSelect.value as ToolMode;

        canvas.addEventListener('pointerdown', (e) => {
            undoStacks[pageIdx].push(ctx2d.getImageData(0, 0, canvas.width, canvas.height));
            if (undoStacks[pageIdx].length > 30) undoStacks[pageIdx].shift();
            redoStacks[pageIdx].length = 0;

            drawing = true;
            startPos = cssToCanvas(e);
            strokePoints = [startPos];

            const tool = getTool(e);
            const w    = parseInt(brushInput.value);
            applyTool(tool, w);

            const isSnap = snapBtn.hasClass('pdf-sketch-toolbar-btn--active');
            const needsSnapshot = isSnap || tool === 'highlighter';
            if (needsSnapshot) {
                preStrokeSnapshot = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
            } else {
                preStrokeSnapshot = null;
                ctx2d.beginPath();
                ctx2d.moveTo(startPos.x, startPos.y);
            }

            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const tool = getTool(e);
            const w    = parseInt(brushInput.value);
            applyTool(tool, w);
            let pos = cssToCanvas(e);

            if (preStrokeSnapshot) {
                const isSnap = snapBtn.hasClass('pdf-sketch-toolbar-btn--active');
                if (isSnap) {
                    const dx = Math.abs(pos.x - startPos.x);
                    const dy = Math.abs(pos.y - startPos.y);
                    pos = dx >= dy ? { x: pos.x, y: startPos.y } : { x: startPos.x, y: pos.y };
                } else {
                    strokePoints.push(pos);
                }
                ctx2d.putImageData(preStrokeSnapshot, 0, 0);
                ctx2d.beginPath();
                if (isSnap) {
                    ctx2d.moveTo(startPos.x, startPos.y);
                    ctx2d.lineTo(pos.x, pos.y);
                } else {
                    ctx2d.moveTo(strokePoints[0].x, strokePoints[0].y);
                    for (let i = 1; i < strokePoints.length; i++) {
                        ctx2d.lineTo(strokePoints[i].x, strokePoints[i].y);
                    }
                }
                ctx2d.stroke();
            } else {
                ctx2d.lineTo(pos.x, pos.y);
                ctx2d.stroke();
            }
        });

        const stopDrawing = () => {
            if (!drawing) return;
            drawing = false;
            preStrokeSnapshot = null;
            strokePoints = [];
            ctx2d.globalAlpha = 1;
            ctx2d.lineCap = 'round';
            onStroke();
        };
        canvas.addEventListener('pointerup',     stopDrawing);
        canvas.addEventListener('pointercancel', stopDrawing);
    }

    private async flattenAndSave(
        file:         TFile,
        originalBytes: ArrayBuffer,
        drawCanvases: HTMLCanvasElement[],
    ) {
        const pdfDoc = await PDFDocument.load(originalBytes);
        const pages  = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            const canvas = drawCanvases[i];
            if (!canvas) continue;

            // Skip pages with no marks
            const ctx  = canvas.getContext('2d')!;
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const hasMarks = data.some((v, idx) => idx % 4 === 3 && v > 0);
            if (!hasMarks) continue;

            const pngBytes = Uint8Array.from(
                atob(canvas.toDataURL('image/png').split(',')[1]),
                c => c.charCodeAt(0)
            );
            const pngImage = await pdfDoc.embedPng(pngBytes);

            const page = pages[i];
            const { width, height } = page.getSize();
            page.drawImage(pngImage, { x: 0, y: 0, width, height });
        }

        const saved = await pdfDoc.save();
        const buf = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
        await this.app.vault.modifyBinary(file, buf as ArrayBuffer);
    }
}
