# Tesseract Service Help

Service id: md-tesseract

## Endpoints

- GET /health: Returns service health status.
- GET /config: Returns the service descriptor from service.json.
- GET /help: Returns this help markdown.
- POST /process: Executes OCR tasks.
- GET /files/{dir}/{file}: Downloads generated files.

## OCR Tasks

- image2text: Recognize text from image and return text output.
- searchable_pdf: Create searchable PDF from image.
- image2hocr: Produce HOCR output.
- orientation_detection: Detect page orientation from image.

Task parameters are defined in service.json.
