Card & Doc Scanner
A personal-use iPhone web app (installable, no App Store needed) with two tools:
Scan Business Card — photograph a card, on-device OCR reads the text,
auto-fills an editable contact form, then saves a `.vcf` file that Safari
opens directly into Add to Contacts.
Scan Document — photograph one or more A4 pages, auto-enhance
(contrast + black & white), combine into a single PDF, then share it
straight into the Mail app (or any app) via the iOS share sheet.
Modeled on the UX of apps like Adobe Scan / Microsoft Lens (document capture
flow) and CamCard / Sansan (business card → contact extraction), but built
as a lightweight web app so it can be installed and run without Xcode or an
Apple Developer account.
Install on your iPhone
Host these files somewhere reachable over HTTPS (e.g. GitHub Pages — see
below). Camera access requires HTTPS (or `localhost`).
Open the URL in Safari on your iPhone.
Tap the Share icon → Add to Home Screen.
Launch it from the Home Screen icon — it runs full-screen like a native app.
Hosting on GitHub Pages
In the repo settings, enable Pages → Deploy from branch → `main` → `/ (root)`.
The app will be served at `https://<your-username>.github.io/<repo>/`.
How it works
Camera: `getUserMedia`, rear camera, live preview with a capture shutter.
Business card OCR: Tesseract.js
runs entirely on-device in a Web Worker. The library code is vendored in
`js/vendor/` so the app doesn't depend on a CDN being reachable at runtime;
only the WASM OCR engine and English language model are fetched once on
first use and then cached by the browser for offline reuse.
Field extraction: `js/ocr.js` applies simple, editable heuristics
(regex for email/phone/URL, keyword matching for job titles and company
suffixes, Australian state/postcode patterns for addresses) to turn raw
OCR text into a contact — always shown in an editable form before saving,
since OCR is never perfect.
Contact save: builds a standard vCard (including a photo of the card)
as a `.vcf` file. iOS Safari recognizes this file type and offers
Create New Contact / Add to Existing Contact directly.
Document → PDF: pages are captured, contrast-enhanced, and combined
into an A4-sized PDF client-side using jsPDF
(also vendored locally, fully offline-capable).
Share by email: uses the Web Share API (`navigator.share`) with the
PDF file attached, which opens the native iOS share sheet — pick Mail
to send it as an attachment. Falls back to a plain download if the Share
API isn't available.
Recent items: a lightweight local history (localStorage) shown on the
home screen — nothing is ever uploaded anywhere.
Privacy
Everything — camera capture, OCR, PDF assembly — happens locally in the
browser on your phone. No image, contact, or document data is sent to any
server. The only network requests are the one-time fetch of the OCR engine
files on first use (from jsDelivr), which are then cached for offline use.
Known limitations (MVP)
No automatic perspective/edge detection for document pages — hold the
phone flat and square over the page for best results. A manual crop tool
could be added later.
OCR accuracy varies with lighting and card design — always review the
extracted fields before saving.
Web Share API file sharing requires iOS 16.4+ / a reasonably recent Safari.
