export type PageId =
  | "home"
  | "games"
  | "games-news"
  | "library"
  | "community"
  | "community-forums"
  | "community-leaderboard"
  | "crew-achievements"
  | "nuggies"
  | "nuggies-casino"
  | "nuggies-history"
  | "nuggies-loans"
  | "nuggies-milestones"
  | "profile"
  | "settings"
  | "tide-check"
  | "islander-profile"
  | "admin";

export type Recommendation = {
  appId: number;
  name: string;
  owners: number;
  nearMatchMissingMembers: number;
  score: number;
  reason: string;
  blurb?: string;
};

export type GameModeFlags = {
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
};

export type GameNightAttendeeAvatar = {
  displayName: string;
  avatarUrl: string | null;
  ownsSelected: boolean;
};

export type GameNight = {
  id: number;
  title: string;
  scheduledFor: string;
  createdByUserId: number;
  canManageGame: boolean;
  selectedGameName: string | null;
  selectedAppId: number | null;
  selectedGameImage: string | null;
  selectedGameModes: GameModeFlags | null;
  selectedAt: string | null;
  selectedMaxPlayers: number | null;
  selectedTags: string[];
  attendeeCount: number;
  currentUserAttending: boolean;
  attendees: GameNightAttendeeAvatar[];
};

export type GameNightAttendee = {
  discordUserId: string;
  username: string;
};

export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export type GuildMember = {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleNames: string[];
  inVoice: boolean;
  voiceChannelId?: string | null;
  richPresenceText: string | null;
  activityName?: string | null;
  activityType?: number | null;
  presenceStatus: PresenceStatus | null;
  bannerUrl?: string | null;
  accentColor?: number | null;
};

export type SteamSummary = {
  personaName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  personaState: number | null;
  inGame: string | null;
  level: number | null;
  accountCreated: string | null;
};

export type MeProfile = {
  discordUserId: string;
  steamVisibility: "private" | "members" | "public";
  featureOptIn: boolean;
  username: string;
  displayName: string;
  globalName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: number | null;
  premiumType: number | null;
  profileBlurb: string | null;
  joinedAtGuild: string | null;
  premiumSince: string | null;
  steamId64: string | null;
  steamLastSyncedAt: string | null;
  steam: SteamSummary | null;
  roleNames: string[];
  inVoice: boolean;
  richPresenceText: string | null;
  nuggieBalance: number;
  lifetimeEarned: number;
  claimedToday?: boolean;
  nuggiesOptedOut: boolean;
  equippedItems: EquippedItem[];
  guildId: string | null;
  clientState: Record<string, unknown>;
  currentOnboardingVersion?: number;
};

export type OwnedGameLite = {
  appId: number;
  name: string;
};

export type CrewOwner = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CrewOwnedGame = {
  appId: number;
  name: string;
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
  mpMaxPlayersApprox: number | null;
  maxPlayers: number | null;
  medianSessionMinutes: number | null;
  priceFinalCents: number | null;
  priceDiscountPct: number | null;
  isFree: boolean;
  releaseComingSoon: boolean;
  releaseDateText: string | null;
  developers: string[];
  tags: string[];
  headerImageUrl: string | null;
  ownerCount: number;
  owners: CrewOwner[];
};

export type CrewWishlistGame = {
  appId: number;
  name: string;
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
  mpMaxPlayersApprox: number | null;
  maxPlayers: number | null;
  medianSessionMinutes: number | null;
  priceFinalCents: number | null;
  priceDiscountPct: number | null;
  isFree: boolean;
  developers: string[];
  tags: string[];
  headerImageUrl: string | null;
  hypeCount: number;
  earliestAddedAt: string | null;
  wishlistedBy: CrewOwner[];
};

export type FeaturedRecommendationScope = "voice" | "crew";

export type FeaturedRecommendation = {
  appId: number;
  name: string;
  owners: number;
  scopeMemberCount: number;
  score: number;
  reason: string;
  headerImageUrl: string | null;
  tags: string[];
  maxPlayers: number | null;
  medianSessionMinutes: number | null;
};

export type FeaturedRecommendationResponse = {
  featured: FeaturedRecommendation | null;
  scope: FeaturedRecommendationScope;
  scopeMemberCount: number;
};

export type GameNewsScope = "library" | "wishlist" | "crew";

export type GameNewsItem = {
  appId: number;
  gameName: string;
  headerImageUrl: string | null;
  gid: string;
  title: string;
  url: string;
  contents: string | null;
  feedLabel: string | null;
  feedName: string | null;
  feedType: number | null;
  isExternalUrl: boolean;
  author: string | null;
  tags: string[];
  publishedAt: string;
  scopes: GameNewsScope[];
  aiRelevanceScore?: number | null;
  aiSummary?: string | null;
  aiLabel?: "personal" | "community" | "top_news" | null;
  aiSpoilerWarning?: boolean;
  sourceKind?: "steam" | "rss" | string;
  sourceLabel?: string | null;
};

export type PatchSourceCandidate = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  owners: number;
  sourceCount: number;
};

export type PatchSourceRow = {
  id: string;
  sourceType: "rss" | "atom";
  sourceUrl: string;
  label: string | null;
  enabled: boolean;
  fetchedAt: string | null;
  lastError: string | null;
};

export type PatchSourceGameGroup = {
  appId: number;
  gameName: string;
  headerImageUrl: string | null;
  sources: PatchSourceRow[];
};

export type PatchSourceTestResult = {
  ok: boolean;
  feedTitle?: string | null;
  itemCount?: number;
  sample?: { title: string; url: string; publishedAt: string | null } | null;
  error?: string;
};

export type GeneralNewsItem = {
  id: number;
  sourceType: "rss" | "newsapi";
  sourceName: string;
  externalId: string;
  title: string;
  url: string;
  contents: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string;
  matchedTags: string[];
  aiRelevanceScore: number | null;
  aiSummary: string | null;
  aiSubtitle: string | null;
  aiTags: string[];
  aiWhyRecommended: string | null;
  aiLabel: "top_news" | "community" | "personal" | null;
  aiSpoilerWarning: boolean;
  aiGameTitle: string | null;
  aiTitle?: string | null;
  aiSources?: string[] | null;
  linkedAppId?: number | null;
  upvotes: number;
  downvotes: number;
};

export type ActivityCategory =
  | "all"
  | "friends"
  | "achievements"
  | "milestones"
  | "patches"
  | "forums"
  | "nuggies";

export type ActivityActor = {
  discordUserId: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type ActivityEvent = {
  id: string;
  eventType: string;
  category: ActivityCategory;
  createdAt: string;
  actor: ActivityActor | null;
  target: ActivityActor | null;
  game: { appId: number; name: string; headerImageUrl: string | null } | null;
  gameNightId: string | null;
  payload: Record<string, unknown>;
};

export type NewsCard = {
  id: string;
  title: string;
  body: string;
  icon: string;
  tag: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  createdBy: ActivityActor | null;
};

export type EquippedItem = {
  id: number;
  name: string;
  itemType: "title" | "flair" | "badge";
  itemData: { emoji: string; label?: string; color: string; image?: string };
};

export type NuggieTransaction = {
  id: number;
  amount: number;
  type: string;
  reason: string;
  referenceId: string | null;
  createdAt: string;
};

export type NuggiesShopItem = {
  id: number;
  name: string;
  description: string;
  price: number;
  itemType: "title" | "flair" | "badge";
  itemData: { emoji: string; label?: string; color: string; image?: string };
  owned: boolean;
  equipped: boolean;
};

export type NuggiesInventoryItem = {
  itemId: number;
  name: string;
  description?: string;
  itemType: "title" | "flair" | "badge";
  itemData: { emoji: string; label?: string; color: string; image?: string };
  price: number;
  equipped: boolean;
  purchasedAt: string;
  acquisition?: "shop" | "earned";
};

export type NuggiesLeaderboardEntry = {
  rank: number;
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
  balance: number;
  equippedTitle: EquippedItem | null;
};

export type NuggiesLoanCounterparty = {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type NuggiesLoan = {
  id: number;
  status: "pending" | "active" | "repaid" | "defaulted" | "cancelled";
  principal: number;
  interestRatePct?: number;
  amountDue: number;
  collateral: number;
  dueAt: string;
  isLender: boolean;
  createdAt?: string;
  counterparty?: NuggiesLoanCounterparty | null;
};

export type ForumAuthor = {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ForumCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  position: number;
  isLocked: boolean;
  autoDiscordBridge?: boolean;
  threadCount: number;
  lastActivity: {
    threadId: number;
    threadTitle: string | null;
    threadSlug: string | null;
    at: string | null;
    userDisplayName: string | null;
    userAvatarUrl: string | null;
  } | null;
};

export type ForumThreadListItem = {
  id: number;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  author: ForumAuthor;
  lastReplyUser: { displayName: string; avatarUrl: string | null } | null;
};

export type ForumThreadGame = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
};

export type ForumThreadType = "discussion" | "memory" | "recommendation" | "resource";

export type ForumPollOption = { id: number; label: string; votes: number };
export type ForumPoll = {
  id: number;
  question: string;
  multi: boolean;
  closesAt: string | null;
  totalVoters: number;
  options: ForumPollOption[];
  myVotes: number[];
};

export type ForumLinkPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export type ForumThreadDetail = {
  id: number;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  title: string;
  slug: string;
  threadType: ForumThreadType;
  linkUrl: string | null;
  linkPreview?: ForumLinkPreview | null;
  poll?: ForumPoll | null;
  subscribed: boolean;
  firstUnreadPostId: number | null;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  author: ForumAuthor;
  game?: ForumThreadGame | null;
};

export type ForumNotification = {
  id: number;
  type: "mention" | "reply";
  threadId: number | null;
  postId: number | null;
  read: boolean;
  createdAt: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  threadTitle: string | null;
};

export type ForumMember = { username: string; displayName: string; avatarUrl: string | null };

export type ForumReactionKey = "nug" | "heart" | "laugh" | "fire" | "salute";

export type ForumAttachment = { url: string; thumbUrl: string; width: number; height: number };

export type ForumUpload = { id: number; url: string; thumbUrl: string; width: number; height: number };

export type ForumPost = {
  id: number;
  threadId: number;
  body: string;
  isOp: boolean;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  author: ForumAuthor;
  reactions: Partial<Record<ForumReactionKey, number>>;
  myReactions: ForumReactionKey[];
  attachments: ForumAttachment[];
};

export type ForumFeedSort = "latest" | "top" | "unanswered" | "mine";

export type ForumFeedThread = {
  id: number;
  title: string;
  slug: string;
  threadType: ForumThreadType;
  linkUrl: string | null;
  linkPreview?: ForumLinkPreview | null;
  coverImage?: { url: string; thumbUrl: string } | null;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  author: ForumAuthor;
  lastReplyUser: { displayName: string; avatarUrl: string | null } | null;
  game?: ForumThreadGame | null;
  unread?: boolean;
};

export type ForumStats = {
  threadsTotal: number;
  postsTotal: number;
  categoriesTotal: number;
  postsToday: number;
  topAuthors: { displayName: string; avatarUrl: string | null; postCount: number }[];
  mine: { threadCount: number; postCount: number; reactionsGiven: number };
  typeCounts: Partial<Record<ForumThreadType, number>>;
};

export type ForumRecentThread = {
  id: number;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  author: { displayName: string; avatarUrl: string | null };
};

export type ForumSearchResult = {
  id: number;
  title: string;
  slug: string;
  threadType: ForumThreadType;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  snippet: string | null;
};

export type ForumResourceItem = {
  id: number;
  title: string;
  slug: string;
  threadType: ForumThreadType;
  linkUrl: string | null;
  linkPreview?: ForumLinkPreview | null;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  author: { displayName: string; avatarUrl: string | null };
};

export type ForumRelatedThread = {
  id: number;
  title: string;
  slug: string;
  threadType: ForumThreadType;
  replyCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
};

export type ForumReport = {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  postId: number | null;
  threadId: number | null;
  threadTitle: string | null;
  threadSlug: string | null;
  postBody: string | null;
  reporterDisplayName: string;
  reporterUsername: string;
  targetDisplayName: string | null;
};

export type ForumBan = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  bannedByDisplayName: string;
};

export type ForumModLogEntry = {
  id: number;
  action: string;
  notes: string | null;
  createdAt: string;
  moderatorDisplayName: string;
  targetThreadTitle: string | null;
  targetThreadId: number | null;
  targetPostId: number | null;
  targetUserDisplayName: string | null;
};

export type ServerSetting = {
  key: string;
  value: string;
  label: string;
  description: string | null;
  isSecret: boolean;
  envDefault: string;
  updatedAt: string;
};
