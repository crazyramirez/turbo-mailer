ALTER TABLE `campaigns` ADD `confirmed_open_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sends` ADD `opened_by_proxy` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tracking_events` ADD `is_proxy` integer DEFAULT false;--> statement-breakpoint
CREATE INDEX `te_send_type_created_idx` ON `tracking_events` (`send_id`,`event_type`,`created_at`);--> statement-breakpoint
-- Backfill: existing rows predate proxy classification. Re-derive is_proxy from
-- the stored user agent for the relays that ARE identifiable by UA alone.
-- Apple MPP cannot be recovered retroactively (it needs the request's Accept /
-- Referer headers, which were never stored), so historical Apple opens stay
-- counted as confirmed. Going forward they are flagged correctly.
UPDATE tracking_events
SET is_proxy = 1
WHERE event_type = 'open'
  AND user_agent IS NOT NULL
  AND (
    user_agent LIKE '%GoogleImageProxy%'
    OR user_agent LIKE '%ggpht.com%'
    OR user_agent LIKE '%YahooMailProxy%'
    OR user_agent LIKE '%ProxyMail%'
  );--> statement-breakpoint
-- Mark the sends whose ONLY open evidence is a proxy prefetch.
UPDATE sends
SET opened_by_proxy = 1
WHERE status = 'opened'
  AND EXISTS (
    SELECT 1 FROM tracking_events te
    WHERE te.send_id = sends.id AND te.event_type = 'open' AND te.is_proxy = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM tracking_events te
    WHERE te.send_id = sends.id
      AND (te.event_type = 'click' OR (te.event_type = 'open' AND te.is_proxy = 0))
  );--> statement-breakpoint
-- Seed confirmed_open_count from the sends that are not proxy-only.
UPDATE campaigns
SET confirmed_open_count = (
  SELECT COUNT(*) FROM sends s
  WHERE s.campaign_id = campaigns.id
    AND s.status = 'opened'
    AND COALESCE(s.opened_by_proxy, 0) = 0
);
