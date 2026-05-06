export type PageId =
  | "home"
  | "games"
  | "games-news"
  | "library"
  | "community"
  | "community-forums"
  | "community-leaderboard"
  | "nuggies"
  | "nuggies-history"
  | "nuggies-milestones"
  | "profile"
  | "settings"
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

export type GameNight = {
  id: number;
  title: string;
  scheduledFor: string;
  createdByUserId: number;
  topGameName: string | null;
  topGameVote: number | null;
  selectedGameName: string | null;
  selectedAppId: number | null;
  selectedAt: string | null;
  attendeeCount: number;
  currentUserAttending: boolean;
};

export type GameNightAttendee = {
  discordUserId: string;
  username: string;
};

export type GuildMember = {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleNames: string[];
  inVoice: boolean;
  richPresenceText: string | null;
};

export type MeProfile = {
  discordUserId: string;
  steamVisibility: "private" | "members" | "public";
  featureOptIn: boolean;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  steamId64: string | null;
  steamLastSyncedAt: string | null;
  roleNames: string[];
  inVoice: boolean;
  richPresenceText: string;
  nuggieBalance: number;
  nuggiesOptedOut: boolean;
  equippedItems: EquippedItem[];
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
  maxPlayers: number;
  medianSessionMinutes: number;
  developers: string[];
  tags: string[];
  headerImageUrl: string | null;
  ownerCount: number;
  owners: CrewOwner[];
};

export type CrewWishlistGame = {
  appId: number;
  name: string;
  maxPlayers: number;
  medianSessionMinutes: number;
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
  upvotes: number;
  downvotes: number;
};

export type ActivityCategory = "all" | "friends" | "achievements" | "milestones" | "patches";

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
  itemData: { emoji: string; label?: string; color: string };
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
  itemData: { emoji: string; label?: string; color: string };
  owned: boolean;
  equipped: boolean;
};

export type NuggiesInventoryItem = {
  itemId: number;
  name: string;
  itemType: "title" | "flair" | "badge";
  itemData: { emoji: string; label?: string; color: string };
  price: number;
  equipped: boolean;
  purchasedAt: string;
};

export type NuggiesLeaderboardEntry = {
  rank: number;
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
  balance: number;
  equippedTitle: EquippedItem | null;
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

export type ForumThreadDetail = {
  id: number;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  categoryAccent: string;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  author: ForumAuthor;
};

export type ForumPost = {
  id: number;
  threadId: number;
  body: string;
  isOp: boolean;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  author: ForumAuthor;
  reactionCount: number;
  userReacted: boolean;
};

export type ForumFeedSort = "latest" | "top" | "unanswered" | "mine";

export type ForumFeedThread = {
  id: number;
  title: string;
  slug: string;
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
};

export type ForumStats = {
  threadsTotal: number;
  postsTotal: number;
  categoriesTotal: number;
  postsToday: number;
  topAuthors: { displayName: string; avatarUrl: string | null; postCount: number }[];
  mine: { threadCount: number; postCount: number };
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
