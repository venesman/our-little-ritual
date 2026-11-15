import { supabase } from "./supabase";

/**
 * Personality quizzes (approved by Vee, 15 Nov 2026). Playful, not psychology
 * tests. Each answer leans towards one result (A–D, in the order of the
 * results); the result you lean to most is yours, and a tie goes to the first.
 * The content lives here; the database only stores which answers you picked.
 */
export interface PQuestion { q: string; a: [string, string, string, string] }
export interface PResult { name: string; text: string; us: string }
export interface PQuiz { code: string; title: string; questions: PQuestion[]; results: [PResult, PResult, PResult, PResult] }

const Q = (q: string, a: string, b: string, c: string, d: string): PQuestion => ({ q, a: [a, b, c, d] });
const R = (name: string, text: string, us: string): PResult => ({ name, text, us });

export const PERSONALITY: PQuiz[] = [
  {
    code: "bornean_animal", title: "Which Bornean animal are you?",
    questions: [
      Q("Your perfect Saturday?", "A slow morning reading under a tree", "Planning something special for someone you love", "A big day out with lots of laughs", "Staying in with snacks and a blanket"),
      Q("At a party, you're usually…", "Deep in a one-on-one chat", "Making sure everyone feels included", "Telling the funniest story", "Happily near the food"),
      Q("How do you show you care?", "A long, thoughtful message", "The same little ritual every day", "Silly memes and voice notes", "Sending food or a care package"),
      Q("When you're stressed, you…", "Go quiet and think it through", "Call your person", "Distract yourself with something fun", "Nap, then snack"),
      Q("Pick a sound", "Rain on rainforest leaves", "Birdsong at sunrise", "Friends laughing", "A kettle coming to the boil"),
      Q("What do you bring to a team?", "Wisdom", "Loyalty", "Good vibes", "Calm"),
    ],
    results: [
      R("The Orangutan", "Thoughtful, gentle and wise beyond your years. You notice what others miss and take your time to get things right.", "You're the one who remembers the little things — and makes slow moments feel special."),
      R("The Hornbill", "Loyal and devoted — hornbills stay with one partner for life. You show love through steady, faithful care.", "Your little rituals are what make the distance feel smaller."),
      R("The Proboscis Monkey", "Playful, sociable and impossible to be bored around. You turn ordinary days into stories.", "You're the one who makes calls end with sore cheeks from laughing."),
      R("The Sun Bear", "Cosy, sweet-toothed and quietly affectionate. You know rest is part of a good life.", "You make home feel like home, wherever it is."),
    ],
  },
  {
    code: "fika_treat", title: "Which fika treat are you?",
    questions: [
      Q("Your ideal café spot?", "By the window, where the regulars sit", "The prettiest café in town", "Wherever has the comfiest sofa", "Takeaway, then off to the park"),
      Q("Your texting style?", "A steady good morning and good night", "Long, romantic paragraphs", "Sleepy late-night chats", "Mostly emojis"),
      Q("A gift you'd love?", "Something handmade", "Flowers and a surprise", "A cosy blanket", "A bag of sweets"),
      Q("Weekend plan?", "Coffee with friends, like always", "Dressing up for a dinner date", "A film marathon", "A spontaneous picnic"),
      Q("How do you survive a Monday?", "Same routine as ever", "A favourite outfit", "Extra coffee and pyjama energy", "A joke to start the day"),
      Q("Pick a colour", "Cinnamon brown", "Marzipan green", "Dark chocolate", "Coconut white"),
    ],
    results: [
      R("The Kanelbulle", "Warm, classic and dependable — the treat everyone's always happy to see.", "You're the steady one. Your 'good morning' is a little anchor."),
      R("The Prinsesstårta", "Romantic, a little dramatic, and proud of it. Life's better with a bit of ceremony.", "You turn ordinary dates into occasions."),
      R("The Kladdkaka", "Gooey, relaxed and deeply comforting. You don't need it to be perfect — just warm.", "You're the soft place to land after a long week."),
      R("The Chokladboll", "Simple, cheerful and full of small joys. Fuss-free and always fun.", "You keep things light when the distance feels heavy."),
    ],
  },
  {
    code: "ld_superpower", title: "What's your long-distance superpower?",
    questions: [
      Q("Something good happens. First you…", "Check what time it is for them", "Save it up to tell them properly", "Plan how to celebrate with them", "Call them straight away"),
      Q("Your partner's having a hard day. You…", "Find the perfect time for a call", "Write them something heartfelt", "Arrange a little surprise delivery", "Stay on a call all evening"),
      Q("Your most-used thing on your phone?", "The world clock", "The notes app", "Delivery and shopping apps", "Video calls"),
      Q("Counting down to a visit, you…", "Make the itinerary", "Write a note for each day", "Plan secret surprises", "Count down together every night"),
      Q("You miss them most when…", "Your times just don't line up", "Something poetic reminds you of them", "You pass a shop they'd love", "The evening goes quiet"),
      Q("Your motto?", "Timing is everything", "Words last", "Little things, big love", "Just being there"),
    ],
    results: [
      R("The Time-Zone Wizard", "You juggle two clocks like magic and always find the moment that works.", "Thanks to you, Kuching and Santiago feel a few hours closer."),
      R("The Love-Letter Poet", "Your words carry across oceans. You say the things that stay.", "Your messages get read twice — at least."),
      R("The Surprise Courier", "Parcels, playlists, a snack that turns up out of nowhere — you make love tangible.", "You remind them you're thinking of them, even from about 16,000 km away."),
      R("The Call-a-thon Champion", "Presence is your gift. You'll fall asleep on a call just to be close.", "You make 'apart' feel like 'together, just quieter'."),
    ],
  },
  {
    code: "travel", title: "What's your travel personality?",
    questions: [
      Q("First thing you do in a new city?", "Check the plan for the day", "Find the best local food", "Get lost on purpose", "Find a café with a view"),
      Q("Packing looks like…", "A list made a week ahead", "Leaving space for snacks to bring home", "One backpack, done", "Comfy clothes and a good book"),
      Q("Dream trip?", "Japan by rail, every stop timed", "Street food from Penang to Santiago", "Trekking in Patagonia", "A cabin by a Swedish lake"),
      Q("Favourite souvenir?", "A guidebook full of notes", "Spices and sweets", "A ticket from somewhere unexpected", "Postcards and photos"),
      Q("Your flight's cancelled. You…", "Already had a back-up plan", "Go find comfort food", "Call it an adventure", "Shrug, and take a nap"),
      Q("The best travel buddy…", "Sticks to the plan", "Shares every dish", "Says yes to anything", "Never rushes"),
    ],
    results: [
      R("The Planner", "Tickets booked, maps saved, nothing left to chance — and somehow it's still fun.", "You're why the next visit will run like a dream."),
      R("The Foodie", "You travel by taste. Every trip is a menu to work through.", "You'll find the laksa, the empanadas and the kanelbullar — all of them."),
      R("The Explorer", "Curious and up for anything. The best stories start where the plan ends.", "You'll turn a wrong turn into your favourite memory."),
      R("The Slow Traveller", "Sunsets, long breakfasts, no rush. You'd rather feel a place than tick it off.", "You make time together feel unhurried — the rarest thing of all."),
    ],
  },
  {
    code: "chile_landscape", title: "Which Chilean landscape are you?",
    questions: [
      Q("Your ideal night?", "Stargazing in silence", "A campfire after a long hike", "Street art and live music", "Rain outside, stories inside"),
      Q("Your style?", "Minimal, neutral tones", "Outdoorsy and practical", "Bold colours", "Knitwear and wool"),
      Q("Pick a word", "Clarity", "Freedom", "Colour", "Wonder"),
      Q("In a group project, you're…", "The calm problem-solver", "The one who takes the leap", "The creative one", "The one with all the stories"),
      Q("Favourite weather?", "Dry and sunny", "Windy and wild", "A sea breeze", "Soft drizzle"),
      Q("Your home would have…", "A big window to the sky", "A wall of hiking gear", "Murals on the walls", "A wood-burning stove"),
    ],
    results: [
      R("The Atacama", "Calm, clear and quietly brilliant — like the clearest night sky on Earth.", "You bring calm when things feel complicated."),
      R("Patagonia", "Wild-hearted and brave, happiest where the map runs out.", "You'll be the one planning the big adventure together."),
      R("Valparaíso", "Colourful, creative and a little chaotic in the best way.", "You fill your little world with colour."),
      R("Chiloé", "Cosy and full of stories — wooden churches, old myths and rain on the roof.", "You make ordinary evenings feel like a storybook."),
    ],
  },
  {
    code: "date_night", title: "What's your date-night style?",
    questions: [
      Q("Perfect first date?", "A candlelit restaurant", "Kayaking somewhere new", "Home-cooked dinner and a film", "A pottery class"),
      Q("Dress code?", "Dressed up", "Trainers", "Pyjamas", "Something with personality"),
      Q("Best video-call date?", "Dinner together on camera, dressed nicely", "A virtual tour of somewhere far away", "Watching the same film together", "Drawing each other"),
      Q("Dessert?", "Crème brûlée", "Whatever the street stall has", "Ice cream straight from the tub", "Something you baked together"),
      Q("Date-night soundtrack?", "Jazz", "Road-trip songs", "Lo-fi beats", "Your shared playlist"),
      Q("What makes a date memorable?", "The atmosphere", "The story you'll tell later", "Feeling completely relaxed", "Making something together"),
    ],
    results: [
      R("The Fancy Dinner", "Candles, good food, a reason to dress up. You love a sense of occasion.", "You make even a video call feel like a proper date."),
      R("The Adventure Date", "The best dates come with a story — and maybe a little mud.", "Your next visit will be full of firsts."),
      R("The Cosy Night In", "Blankets, snacks, nowhere to be. Comfort is romance.", "Falling asleep on a call counts as a perfect date."),
      R("The Creative Date", "You'd rather make something together than just watch.", "Your dates leave keepsakes behind — perfect for the scrapbook."),
    ],
  },
  {
    code: "texting", title: "What's your texting style?",
    questions: [
      Q("Something funny happens. You…", "Write the whole story out", "Send a voice note", "Send a meme about it", "Send a quick 'haha you'd love this'"),
      Q("Your usual reply time?", "When I can write properly", "Whenever I'm out walking", "Instantly, with a GIF", "Like clockwork"),
      Q("Favourite emoji?", "❤️", "🎙️", "😂", "☀️"),
      Q("After a long day, you send…", "A long recap", "A four-minute voice note", "A reaction GIF", "'Home safe ✓'"),
      Q("Your chat is mostly…", "Essays", "Audio", "Memes", "Check-ins"),
      Q("What do you love receiving most?", "A long message", "Their voice", "Something that made them think of you", "The daily good morning"),
    ],
    results: [
      R("The Paragraph Writer", "Why say it in three words when you can say it beautifully in three hundred?", "Your messages are little letters — save the best ones in the Mailbox."),
      R("The Voice-Note Sender", "You'd rather be heard than read. Your voice notes are a podcast for one.", "Hearing you is half the reason the distance feels smaller."),
      R("The Meme Lord", "You speak fluent internet. A well-timed meme says everything.", "You keep the laughs going across time zones."),
      R("The Good-Morning Regular", "Short, steady, always there. Consistency is your love language.", "Your daily check-in is the heartbeat of the relationship."),
    ],
  },
  {
    code: "cosy_weekend", title: "Which cosy weekend are you?",
    questions: [
      Q("Saturday, 9 am. You're…", "Off to try a new café", "Still asleep", "Out on a trail", "Already deep in a hobby"),
      Q("Rainy-day plan?", "A café and a book", "Duvet and a series", "A walk in the rain", "Finish a project"),
      Q("Weekend snack?", "A pastry", "Toast in bed", "Trail mix", "Whatever's within reach"),
      Q("Sunday reset?", "Brunch", "A long nap", "Sunset outside", "Sorting your hobby supplies"),
      Q("Pick a smell", "Fresh coffee", "Clean sheets", "Forest after rain", "Paint, paper or wood"),
      Q("A weekend well spent means…", "Finding a great new spot", "Feeling fully rested", "Plenty of fresh air", "Making something"),
    ],
    results: [
      R("The Café Hop", "Lattes, pastries and a new corner of the city every weekend.", "You've already got a list of cafés to try together."),
      R("The Lazy Lie-in", "Rest is a skill and you've mastered it.", "Slow mornings on a call are your kind of romance."),
      R("The Nature Escape", "Fresh air resets everything. Trails, beaches, sunsets.", "Bako, Patagonia and Swedish forests are all waiting."),
      R("The Hobby Marathon", "Give you a free weekend and you'll make something wonderful.", "You'll love the Creative Corner."),
    ],
  },
  {
    code: "festival", title: "Which festival matches your vibe?",
    questions: [
      Q("Your favourite part of celebrating?", "Being with family", "Being outdoors", "Dancing", "Quiet candlelight"),
      Q("Favourite season?", "Harvest time", "Summer", "Spring", "Winter"),
      Q("You bring to a party…", "A home-cooked dish", "Flowers", "The music", "Candles"),
      Q("Pick a festive drink", "Tuak (rice wine)", "Elderflower cordial", "Mote con huesillo", "Warm glögg"),
      Q("Your ideal crowd?", "The whole extended family", "Friends in a meadow", "The whole town", "A small circle of close friends"),
      Q("A celebration should feel like…", "Gratitude", "Freedom", "Joy", "Hope"),
    ],
    results: [
      R("Gawai", "Grateful and family-hearted — you celebrate what's been gathered together.", "You'll make sure the people you love feel part of your story."),
      R("Midsummer", "Light and playful: flower crowns, long evenings and dancing round the maypole.", "You bring summer energy, whatever the season."),
      R("Fiestas Patrias", "Big-hearted and full of rhythm — cueca, empanadas and everyone invited.", "You turn any small win into a celebration."),
      R("Lucia", "A calm light in the dark months — gentle, hopeful and steady.", "You're the warm glow on the hard days."),
    ],
  },
  {
    code: "kitchen", title: "What's your role in our future kitchen?",
    questions: [
      Q("In the kitchen, you…", "Take charge", "Measure everything carefully", "Hover and taste", "Tidy as you go"),
      Q("Your signature contribution?", "A curry or laksa from scratch", "A tray of kanelbullar", "The perfect playlist", "A spotless counter"),
      Q("Recipes are…", "A loose guide", "To be followed exactly", "'Wait, what are we making?'", "Something you organise the ingredients for"),
      Q("Favourite kitchen gadget?", "A sharp knife", "A stand mixer", "A speaker", "The dishwasher"),
      Q("Something burns. You…", "Improvise", "Start again, properly", "Suggest takeaway", "Quietly clean up"),
      Q("Best part of dinner?", "Cooking it", "Dessert", "Eating it", "A clean kitchen afterwards"),
    ],
    results: [
      R("The Head Chef", "Confident, creative and happiest at the stove.", "You'll be cooking dishes from three countries in one kitchen."),
      R("The Baker", "Patient and precise — the oven is your happy place.", "Fika at home will never be the same."),
      R("The Taste-Tester & DJ", "Morale officer, chief taster, keeper of the playlist.", "You make cooking together feel like a party."),
      R("The Organiser", "Calm, clean and quietly essential. Nothing works without you.", "The unsung hero of every dinner."),
    ],
  },
  {
    code: "show_love", title: "How do you like to show love?",
    questions: [
      Q("Your partner's had a big win. You…", "Tell them how proud you are", "Clear your evening to celebrate", "Send a little something", "Take a task off their plate"),
      Q("What makes you feel most loved?", "Hearing 'I'm proud of you'", "Their full, undivided attention", "A thoughtful surprise", "Someone handling something for you"),
      Q("While you're apart, you…", "Write notes and letters", "Plan long calls", "Send parcels", "Help with their to-do list"),
      Q("Ideal anniversary?", "A heartfelt letter", "A whole day together", "A meaningful gift", "Planning everything so they can relax"),
      Q("What hurts most?", "Unkind words", "Being half-listened to", "A forgotten occasion", "Being left to do it all"),
      Q("A little thing that means a lot?", "A good-night message", "Phones away at dinner", "Bringing back a favourite snack", "Making them a coffee"),
    ],
    results: [
      R("Sweet Words", "Compliments, notes and 'I'm proud of you' — words are how you give and feel love.", "The Mailbox was made for you."),
      R("Quality Time", "Your attention is your gift. Being fully present matters most.", "A long, unhurried call beats any gift."),
      R("Little Gifts", "Not about price — it's the 'I saw this and thought of you'.", "A Little Whim is right up your street."),
      R("Helpful Acts", "You show love by making life easier — booking, fixing, planning.", "You're the reason the next visit will run smoothly."),
    ],
  },
  {
    code: "lark_owl", title: "Morning lark or night owl — which kind?",
    questions: [
      Q("Your alarm goes off. You…", "Were already awake", "Snooze once, gently", "What alarm?", "Get up — and plan a nap"),
      Q("Your best ideas come…", "At 7 am", "Mid-morning, with coffee", "At 1 am", "Right after a nap"),
      Q("Perfect time for a call?", "Early, before the day starts", "A lazy weekend morning", "Late at night", "Any time — I'll nap after"),
      Q("Breakfast?", "Big and early", "Slow coffee first", "At noon", "Brunch, obviously"),
      Q("Weekend highlight?", "A sunrise walk", "Breakfast in bed", "A late night out (or in)", "The afternoon nap"),
      Q("Your spirit animal?", "A rooster", "A cat stretching in the sun", "An owl", "A sloth"),
    ],
    results: [
      R("The Sunrise Lark", "Up with the sun and full of plans before breakfast.", "With an 11–12-hour gap, your early starts can catch their evenings."),
      R("The Gentle Riser", "Mornings are for easing in — tea first, world later.", "Slow weekend-morning calls are your sweet spot."),
      R("The Midnight Owl", "Creative, chatty and wide awake when the world goes quiet.", "Late nights for you can be mornings for them — perfect."),
      R("The Nap Champion", "Flexible hours, strategic naps — you fit around anything.", "You can make any time zone work."),
    ],
  },
];

export const quizByCode = (code: string) => PERSONALITY.find((q) => q.code === code);

/** The result you lean to most (a tie goes to the first). Same rule as the database. */
export function resultFor(answers: number[]): number {
  const counts = [0, 0, 0, 0];
  for (const a of answers) if (a >= 0 && a <= 3) counts[a]++;
  let best = 0;
  for (let i = 1; i < 4; i++) if (counts[i] > counts[best]) best = i;
  return best;
}

export interface PersonalityEntry { quiz: string; mine: { result: number; guess: number | null; at: string } | null; partner_taken: boolean;
  partner: { result: number; guess: number | null; at: string } | null; my_row: string | null }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
export const personalityState = async () => (check(await supabase.rpc("personality_state")) ?? []) as PersonalityEntry[];
export const submitPersonality = async (quiz: string, answers: number[], guess: number | null) =>
  check(await supabase.rpc("personality_submit", { p_quiz: quiz, p_answers: answers, p_guess: guess })) as number;
