-- A story can carry a video (an explainer), played full width under the headline in place of the photo.
ALTER TABLE articles ADD COLUMN video_url TEXT DEFAULT '';
