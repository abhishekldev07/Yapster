export const COMMUNITY_CATEGORIES = [
  "Gaming",
  "Internet Culture & Memes",
  "Q&A & Stories",
  "Technology",
  "Entertainment",
  "Movies & TV",
  "Music",
  "Sports",
  "News & Current Events",
  "Science & Education",
  "Art & Design",
  "Food & Cooking",
  "Health & Fitness",
  "Lifestyle",
  "Hobbies & Crafts",
  "Travel & Places",
  "Business & Finance",
  "Relationships",
  "Pets & Animals",
  "Other",
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
