// EZD-304 (02 Stack PDF in: pdf.js; 11 rule 3): pdf.js's own worker, which reads the PDF off the main thread. Its
// module sets itself up on the worker's port when loaded.
import 'pdfjs-dist/build/pdf.worker.mjs';
