DEV_PORT ?= 8000

.PHONY: dev
dev:
	@PORT=$(DEV_PORT) bash scripts/dev.sh

