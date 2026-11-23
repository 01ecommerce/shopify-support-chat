# Tests run in Docker only. Nothing here is machine-wide: no ports, volumes or networks.
RUN_ID := $(shell date +%s)$$$$
IMAGE  := node:22-alpine
NAME   := shopify-support-chat-test

.PHONY: test check clean

test:
	docker run --rm --name $(NAME)-$(RUN_ID) -v "$(CURDIR)":/w -w /w $(IMAGE) node --test

check: test

clean:
	@ids="$$(docker ps -aq --filter name=$(NAME)-)"; \
	if [ -n "$$ids" ]; then docker rm -f $$ids; else echo "no leftover $(NAME)-* containers"; fi
