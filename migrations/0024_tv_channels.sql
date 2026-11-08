-- Rashtrix TV: whole YouTube channels as sources. A channel added to the vertical channel feeds
-- its Shorts, and one added to the horizontal channel feeds its long videos (both as playlists).
-- A channel added as a live source follows whatever that channel is broadcasting: the video id of
-- its current live is kept here, and is empty while the channel is not live.
ALTER TABLE tv_sources ADD COLUMN live_video TEXT NOT NULL DEFAULT '';

-- A playlist added with "Live" ticked is a playlist: turn it back into one, take it off air, and
-- have it read again at the next refresh.
UPDATE OR IGNORE tv_sources SET kind='playlist', on_air=0, live_now=0, last_refresh=NULL
  WHERE kind='live' AND (yt_id LIKE 'PL%' OR yt_id LIKE 'UU%' OR yt_id LIKE 'FL%' OR yt_id LIKE 'OL%' OR yt_id LIKE 'RD%' OR yt_id LIKE 'LL%') AND length(yt_id) > 11;
DELETE FROM tv_sources WHERE kind='live' AND (yt_id LIKE 'PL%' OR yt_id LIKE 'UU%' OR yt_id LIKE 'FL%' OR yt_id LIKE 'OL%' OR yt_id LIKE 'RD%' OR yt_id LIKE 'LL%') AND length(yt_id) > 11;
