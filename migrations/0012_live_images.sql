-- A hero image (shown on the coverage page with a blinking LIVE tab) and a social image (the
-- link preview, usually the hero with a LIVE tab baked in) for live coverage.
ALTER TABLE live_coverage ADD COLUMN image_url TEXT DEFAULT '';
ALTER TABLE live_coverage ADD COLUMN social_url TEXT DEFAULT '';
ALTER TABLE live_coverage ADD COLUMN hero_caption TEXT DEFAULT '';
