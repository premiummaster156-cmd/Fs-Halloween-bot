-- Allow the current paid Custom Bot Commission request type.
-- Keep older ticket type values valid so existing ticket rows remain compatible.
ALTER TABLE coopft_tickets
  DROP CONSTRAINT IF EXISTS coopft_tickets_ticket_type_check;

ALTER TABLE coopft_tickets
  ADD CONSTRAINT coopft_tickets_ticket_type_check
  CHECK (ticket_type IN (
    'support', 'bug', 'custom_bot', 'suggestion',
    'bot_bug', 'bot_suggestion', 'bot_gameplay', 'bot_account', 'bot_exploit',
    'server_support', 'server_bug', 'server_suggestion', 'member_report',
    'staff_report', 'custom_bot_request', 'partnership'
  ));
