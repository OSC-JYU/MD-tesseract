IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
VOLUME := md-tesseract-data
VERSION := 0.1


clean:
	docker rm -f $(CONTAINERS)
	docker rmi -f $(IMAGES)

create_volume:
	docker volume create $(VOLUME)

build:
	docker build -t osc.jyu.fi/md-tesseract:$(VERSION) .

start:
	docker run -d --name md-tesseract \
		-v $(VOLUME):/logs \
		-p 8400:8400 \
		--restart unless-stopped \
		osc.jyu.fi/md-tesseract:$(VERSION)

restart:
	docker stop md-tesseract
	docker rm md-tesseract
	$(MAKE) start

bash:
	docker exec -it md-tesseract bash