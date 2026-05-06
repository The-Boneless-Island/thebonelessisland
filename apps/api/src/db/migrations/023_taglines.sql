INSERT INTO server_settings (key, value, label, description, is_secret)
VALUES (
  'splash_taglines',
  '["No bones about it.","Somehow still online.","Skill issue.","₦0 balance. Maximum vibes.","The final boss was friendship.","Probably haunted.","GG no re.","Lost ₦160 on a coin flip.","The sand is fake. The people are real.","Boneless since day one.","Insert coin to continue.","Not affiliated with actual islands.","₦ goes brrr.","Built for six people. Used by six people.","Save file corrupted.","100% completion never.","Unranked, as tradition demands.","We do not acknowledge the old website.","Touch grass? On this island?","Achievement unlocked: Found us.","New boneless just dropped.","Not responsible for lost Nuggies.","Ping: 999.","AFK since forever.","Not a cult. (Yet.)","One HP left.","No refunds.","₦500 says you come back.","Carrying the team since day one.","Tried to leave. Came back.","The voices are just Discord notifications.","Technically, it''s a landmass.","The lore is real.","Still in beta. Always in beta.","This is fine. (It''s not fine.)","Respawning...","Built different. Runs worse.","Press F to pay respects.","Game night is mandatory.","Loading your consequences...","Continue? 9... 8... 7...","Certified no-bones day.","The lag is on your end.","No P2W. Just Nuggies.","The island chose you.","The bones were in us all along.","We made a website again.","Every coin flip was a mistake.","All roads lead to game night.","You can''t leave. (We checked.)"]',
  'Splash taglines',
  'Weekly-rotating subtitle taglines shown on the home splash and topbar. Auto-refreshed every 7 days by the server.',
  false
)
ON CONFLICT (key) DO NOTHING;
