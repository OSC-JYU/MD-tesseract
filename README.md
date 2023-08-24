

	curl -X POST -H "Content-Type: multipart/form-data" \
	  -F "request=@test/image2text.json;type=application/json" \
	  -F "content=@test/sample.png" \
	  http://localhost:8400/process