IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
VOLUME := md-tesseract-data
VERSION := 0.1
REPOSITORY := localhost
IMAGE := md-tesseract


clean:
	docker rm -f $(CONTAINERS)
	docker rmi -f $(IMAGES)

build:
	docker build -t $(REPOSITORY)/messydesk/$(IMAGE):$(VERSION) .

start:
	docker run -d --name $(IMAGE) \
		-v $(VOLUME):/logs \
		-p 8400:8400 \
		--restart unless-stopped \
		$(REPOSITORY)/messydesk/$(IMAGE):$(VERSION)

restart:
	docker stop $(IMAGE)
	docker rm $(IMAGE)
	$(MAKE) start

stop:
	docker stop $(IMAGE)
	docker rm $(IMAGE)

bash:
	docker exec -it $(IMAGE) bash
