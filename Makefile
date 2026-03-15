export VERSION := 1.0.9
export GITHUB_REPO := MildC/jellyfin-plugin-open-with
export FILE := jellyfin-plugin-open-with-$(VERSION).zip

.PHONY: build clean zip release update-version update-manifest commit-version push create-tag create-gh-release

build:
	dotnet clean
	dotnet build -c Release

clean:
	dotnet clean
	rm -f *.zip

zip:
	cd bin/Release/net9.0 && zip -r ../../../$(FILE) .

checksum:
	@echo "Checksum: $$(md5 -q $(FILE))"

create-tag:
	git tag v$(VERSION)

create-gh-release:
	gh release create v$(VERSION) "$(FILE)" \
		--title "v$(VERSION)" \
		--notes "$$(cat RELEASE_NOTES.md 2>/dev/null || echo 'Release v$(VERSION)')"

update-version:
	node scripts/update-version.js

update-manifest:
	node scripts/update-manifest.js

# Commit version changes
commit-version:
	git add manifest.json Jellyfin.Plugin.OpenWith.csproj
	git commit -m "chore: bump version to $(VERSION)"

# Push commits and tags
push:
	git push origin main
	git push origin v$(VERSION)

# Full release workflow
release: update-version build zip update-manifest commit-version create-tag push create-gh-release
	@echo "Release $(VERSION) completed successfully!"
	@echo "Don't forget to delete the old plugin directory on your server"

# Quick rebuild and rezip (for fixing existing version)
rebuild: clean build zip
	@echo "Rebuilt $(FILE)"
	@echo "New checksum: $$(md5 -q $(FILE))"
