
Image to text

	curl -X POST -H "Content-Type: multipart/form-data" \
	  -F "request=@test/image2text.json;type=application/json" \
	  -F "content=@test/sample.png" \
	  http://localhost:8400/process

Image to searcable pdf

	curl -X POST -H "Content-Type: multipart/form-data" \
	  -F "request=@test/image2pdf.json;type=application/json" \
	  -F "content=@test/sample.png" \
	  http://localhost:8400/process


Orientation detection:

	curl -X POST -H "Content-Type: multipart/form-data"      -F "request=@test/orientation_detection.json;type=application/json"     -F "content=@test/sample.png"           http://localhost:8400/process
