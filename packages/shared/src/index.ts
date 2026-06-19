export type DiscordIdentity = {
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
};

export type SteamLink = {
  steamId64: string;
  visibility: "private" | "members" | "public";
};

export type RecommendationInput = {
  memberIds: string[];
  sessionLength: "short" | "long" | "any";
  maxGroupSize: number;
};

export type RecommendedGame = {
  appId: number;
  name: string;
  owners: number;
  selectedMembers: number;
  nearMatchMissingMembers: number;
  score: number;
  reason: string;
  blurb?: string;
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
