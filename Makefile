# Tests run in Docker only. Nothing here is machine-wide: no ports, volumes or networks.
RUN_ID := $(shell date +%s)$$$$
IMAGE  := node:22-alpine
NAME   := shopify-support-chat-test

.PHONY: test check clean wiki-preview

test:
	docker run --rm --name $(NAME)-$(RUN_ID) -v "$(CURDIR)":/w -w /w $(IMAGE) node --test

check: test

# Preview the generated wiki: writes the pages to ./.wiki-preview/ (git-ignored) and lists them.
# A page left over from a doc you deleted stays until you delete ./.wiki-preview yourself.
wiki-preview:
	docker run --rm --name $(NAME)-$(RUN_ID) -v "$(CURDIR)":/w -w /w $(IMAGE) node scripts/build-wiki.js .wiki-preview "$$(git rev-parse HEAD)"
	@echo "pages in .wiki-preview:"; ls -1 .wiki-preview

clean:
	@ids="$$(docker ps -aq --filter name=$(NAME)-)"; \
	if [ -n "$$ids" ]; then docker rm -f $$ids; else echo "no leftover $(NAME)-* containers"; fi
