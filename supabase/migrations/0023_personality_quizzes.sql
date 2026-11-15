-- =====================================================================
-- Our Little Ritual — Quiz Time: personality quizzes + 150 more questions
-- (approved by Vee, 15 Nov 2026)
--
-- Personality quizzes: 12 playful quizzes (the words live in the app). You each
-- take one; your partner's result stays hidden until you've taken it too, then
-- you compare cards. You can guess your partner's result before you start.
-- Results can go into the scrapbook. Retaking replaces your answers (your first
-- guess is kept, since you'll have seen their card by then).
-- =====================================================================

-- ------------------------------------------- 150 more questions (Asia, Europe, South America, anime, games, myths)
insert into public.quiz_questions (category, question, correct, wrong, difficulty, source, external_key) values
  ('anime', 'Which studio made ''Spirited Away''?', 'Studio Ghibli', array['Toei Animation', 'Madhouse', 'Kyoto Animation'], 'easy', 'starter', 'starter:c167d202fc0d9097271dd5d412bc3237'),
  ('anime', 'In ''Naruto'', what does Naruto dream of becoming?', 'Hokage', array['Shogun', 'Pirate King', 'Hunter'], 'easy', 'starter', 'starter:df555826170e703321c54fcc1ddbe46a'),
  ('anime', 'In ''One Piece'', what does Luffy want to become?', 'King of the Pirates', array['Hokage', 'The strongest hero', 'A shinigami'], 'easy', 'starter', 'starter:c7d72d6c8021d1b24bc74fb5eabf3266'),
  ('anime', 'What type of Pokémon is Pikachu?', 'Electric', array['Fire', 'Water', 'Grass'], 'easy', 'starter', 'starter:8b77f8cb48d1f72a94305e3eff346f60'),
  ('anime', 'Who created ''Dragon Ball''?', 'Akira Toriyama', array['Eiichiro Oda', 'Masashi Kishimoto', 'Hayao Miyazaki'], 'medium', 'starter', 'starter:4650890689e8b8805f38b2de702a1371'),
  ('anime', 'In ''Attack on Titan'', how do humans protect themselves from the Titans?', 'They live behind giant walls', array['They live underground', 'They live on floating islands', 'They live under the sea'], 'easy', 'starter', 'starter:33c6a5b4a1ebc4c8fa6fb40c9d84b95c'),
  ('anime', 'What is Sailor Moon''s real name?', 'Usagi Tsukino', array['Ami Mizuno', 'Rei Hino', 'Makoto Kino'], 'medium', 'starter', 'starter:99adba89339006abbe9102be3e2bf8f1'),
  ('anime', 'What is ''manga''?', 'Japanese comics', array['Japanese TV cartoons', 'Japanese video games', 'Japanese puppet shows'], 'easy', 'starter', 'starter:c396e3176f1756b52b9f488d369ad7eb'),
  ('anime', 'In ''Death Note'', who did the notebook originally belong to?', 'A shinigami (death god)', array['A detective', 'A teacher', 'A dragon'], 'medium', 'starter', 'starter:e351bd93e1e06775e0aaa2f5e4d367a4'),
  ('anime', 'Where does Totoro live?', 'In a giant camphor tree', array['In a cave', 'In a castle', 'At the bottom of a lake'], 'medium', 'starter', 'starter:e0b779edd932ff3ccb244540617e4cb8'),
  ('anime', 'Who is the main character of ''Demon Slayer''?', 'Tanjiro Kamado', array['Zenitsu Agatsuma', 'Inosuke Hashibira', 'Giyu Tomioka'], 'easy', 'starter', 'starter:ab7a36652f4626ee1be5c446fcd7a38a'),
  ('anime', 'Which Miyazaki film won the Oscar for Best Animated Feature in 2003?', 'Spirited Away', array['Princess Mononoke', 'My Neighbor Totoro', 'Howl''s Moving Castle'], 'medium', 'starter', 'starter:eba1bc37fabc1f0db311f5f86b63951d'),
  ('anime', 'In ''My Hero Academia'', what are superpowers called?', 'Quirks', array['Jutsu', 'Nen', 'Stands'], 'medium', 'starter', 'starter:85f030420691b851620d44d3695f6eea'),
  ('anime', 'Doraemon is a robot…', 'Cat', array['Dog', 'Rabbit', 'Bear'], 'easy', 'starter', 'starter:11b5830e3dec57796b0af7e062c7846e'),
  ('anime', 'In which anime would you find the Survey Corps?', 'Attack on Titan', array['Bleach', 'Naruto', 'Fullmetal Alchemist'], 'medium', 'starter', 'starter:12f337fbacc48d5b9af3351ae09b8ad9'),
  ('games', 'In which city is Mojang, the studio behind Minecraft, based?', 'Stockholm', array['Gothenburg', 'Oslo', 'Copenhagen'], 'medium', 'starter', 'starter:105bf2fc84809ff65587db5b9ef85fb2'),
  ('games', 'Which company makes the Super Mario games?', 'Nintendo', array['Sony', 'Sega', 'Capcom'], 'easy', 'starter', 'starter:55f97a95a360ad2ab214b23f0ff1e30b'),
  ('games', 'What is the name of Mario''s brother?', 'Luigi', array['Wario', 'Toad', 'Yoshi'], 'easy', 'starter', 'starter:3518f59f3b97f19cd14cb3b316ec19c2'),
  ('games', 'King, the company behind ''Candy Crush'', was founded in which country?', 'Sweden', array['Finland', 'United Kingdom', 'Japan'], 'medium', 'starter', 'starter:31535a9fb8974fa319442cc9b03e7478'),
  ('games', 'DICE, the studio behind the ''Battlefield'' games, comes from which country?', 'Sweden', array['Germany', 'Canada', 'Poland'], 'medium', 'starter', 'starter:18d2943c4317bb08a97e44a041255157'),
  ('games', 'What is the name of the hero in ''The Legend of Zelda''?', 'Link', array['Zelda', 'Ganon', 'Epona'], 'easy', 'starter', 'starter:615e9a1889d5993129e25249dd39d94f'),
  ('games', 'In the first Pokémon games, which region does your journey start in?', 'Kanto', array['Johto', 'Hoenn', 'Sinnoh'], 'medium', 'starter', 'starter:c9bdcffcaaa8a16d6416ba690be54e10'),
  ('games', 'In which game do green ''Creepers'' explode near you?', 'Minecraft', array['Terraria', 'Roblox', 'Fortnite'], 'easy', 'starter', 'starter:1860b362ea9eafe221943e737c1b8ae0'),
  ('games', 'In which country was Tetris created?', 'The Soviet Union', array['Japan', 'Finland', 'Germany'], 'medium', 'starter', 'starter:89550ffc62afc2bd42dec9c99aecd155'),
  ('games', 'Pac-Man was created in which country?', 'Japan', array['South Korea', 'China', 'United Kingdom'], 'easy', 'starter', 'starter:c38e9b59c258563062d10a8386784951'),
  ('games', 'What kind of animal is Sonic?', 'Hedgehog', array['Fox', 'Echidna', 'Rabbit'], 'easy', 'starter', 'starter:e993ca5ecd3dbba12346cbe533477f68'),
  ('games', 'In ''Animal Crossing: New Horizons'', who runs the island''s business?', 'Tom Nook', array['Isabelle', 'K.K. Slider', 'Blathers'], 'easy', 'starter', 'starter:4e935e6c6ec6e94d4e6f83565cc92ea9'),
  ('games', 'Which company makes ''Genshin Impact''?', 'miHoYo (HoYoverse)', array['Nintendo', 'Tencent', 'Square Enix'], 'medium', 'starter', 'starter:76fa9bc127eaf201046630d68f566bbc'),
  ('games', 'Which company makes the ''Final Fantasy'' series?', 'Square Enix', array['Capcom', 'Bandai Namco', 'Konami'], 'medium', 'starter', 'starter:2082c914846e3f4a5209dc5a9d412e87'),
  ('games', 'Moonton, the maker of ''Mobile Legends: Bang Bang'', is based in which country?', 'China', array['Malaysia', 'Indonesia', 'South Korea'], 'hard', 'starter', 'starter:cd164836d9b696e1307fe538f983ad95'),
  ('mythology', 'Who is the Norse god of thunder?', 'Thor', array['Loki', 'Freyr', 'Balder'], 'easy', 'starter', 'starter:95a98aa8a9006c8f38da63317eb61f11'),
  ('mythology', 'Who is the chief of the Norse gods?', 'Odin', array['Thor', 'Tyr', 'Heimdall'], 'easy', 'starter', 'starter:8db9f695a9ef8a28c1c5fb90581f41a6'),
  ('mythology', 'Which day of the week is named after Thor?', 'Thursday', array['Tuesday', 'Wednesday', 'Friday'], 'easy', 'starter', 'starter:e6185fd1953613d5c4be77875b306395'),
  ('mythology', 'What is the giant world tree of Norse mythology called?', 'Yggdrasil', array['Valhalla', 'Bifrost', 'Asgard'], 'medium', 'starter', 'starter:58f2022e746ad0c268ff1ee702f45cb2'),
  ('mythology', 'Who is the king of the Greek gods?', 'Zeus', array['Poseidon', 'Hades', 'Apollo'], 'easy', 'starter', 'starter:7b4bbe78d440287f065845160f032a38'),
  ('mythology', 'Who is the Greek goddess of love?', 'Aphrodite', array['Athena', 'Hera', 'Artemis'], 'easy', 'starter', 'starter:339fea8d0639fe4a10d24e9beca29e4a'),
  ('mythology', 'Who flew too close to the sun on wings of wax?', 'Icarus', array['Perseus', 'Hercules', 'Achilles'], 'easy', 'starter', 'starter:b0515e6f338aa6327ad45e8731ea544e'),
  ('mythology', 'What happens to people who look at Medusa?', 'They turn to stone', array['They fall asleep', 'They turn into birds', 'They forget who they are'], 'easy', 'starter', 'starter:28c17f30f49b6d2c2949a9d09aa8f6af'),
  ('mythology', 'Who is the ancient Egyptian sun god?', 'Ra', array['Anubis', 'Osiris', 'Set'], 'medium', 'starter', 'starter:b5baa3859641d4d0af62f3b799a593ad'),
  ('mythology', 'Where do fallen warriors go in Norse mythology?', 'Valhalla', array['Olympus', 'Avalon', 'Elysium'], 'easy', 'starter', 'starter:b38946694a45bc3aef92944f40af0366'),
  ('mythology', 'How many animals are in the Chinese zodiac?', '12', array['10', '8', '13'], 'easy', 'starter', 'starter:edb80218c0b8c527d73fd0ccf391db80'),
  ('mythology', 'Which Hindu god has the head of an elephant?', 'Ganesha', array['Shiva', 'Vishnu', 'Hanuman'], 'easy', 'starter', 'starter:057d87e4c8f913307e47197d0221b5db'),
  ('mythology', 'In Malay folklore, what is a pontianak?', 'A female ghost', array['A river dragon', 'A forest giant', 'A magic kris'], 'medium', 'starter', 'starter:e371baee61f512fcf2c05abdeff9d248'),
  ('mythology', 'In Iban belief, Sengalang Burong is the god of…', 'War', array['Rice', 'The sea', 'Music'], 'hard', 'starter', 'starter:cbba764e1573471e241632004ce6ebf4'),
  ('mythology', 'In the folklore of Chiloé (Chile), what is the Trauco?', 'A small creature of the forest', array['A sea serpent', 'A giant condor', 'A ghost ship'], 'hard', 'starter', 'starter:ef9513c6728c942810f86888d392bf35'),
  ('geography', 'What is the capital of Thailand?', 'Bangkok', array['Chiang Mai', 'Phuket', 'Hanoi'], 'easy', 'starter', 'starter:7f190f8f106c2ae48ff1f5902bbe294f'),
  ('geography', 'What is the capital of the Philippines?', 'Manila', array['Cebu', 'Davao', 'Quezon'], 'easy', 'starter', 'starter:ccca29ab11afc6d2831e36cf8f8ce259'),
  ('geography', 'Which is the largest country in Southeast Asia by area?', 'Indonesia', array['Myanmar', 'Thailand', 'Malaysia'], 'medium', 'starter', 'starter:b7d96f5096756560c45e34c16249df9b'),
  ('geography', 'The Mekong River does NOT flow through which country?', 'Malaysia', array['Laos', 'Cambodia', 'Vietnam'], 'medium', 'starter', 'starter:fa9b72b7a5d053a4433ee67fe5b6d67a'),
  ('geography', 'What is the capital of Norway?', 'Oslo', array['Bergen', 'Stockholm', 'Trondheim'], 'easy', 'starter', 'starter:a178c628ff28c449cf50b7b92307b55b'),
  ('geography', 'What is the capital of Finland?', 'Helsinki', array['Tampere', 'Turku', 'Tallinn'], 'easy', 'starter', 'starter:51c75bb1116b7c0967b51eb3ed5254f9'),
  ('geography', 'Which country is most famous for its fjords?', 'Norway', array['Denmark', 'Poland', 'Netherlands'], 'easy', 'starter', 'starter:2d6e8565d0a698cb6503b567b68de428'),
  ('geography', 'What is the capital of Argentina?', 'Buenos Aires', array['Córdoba', 'Montevideo', 'Rosario'], 'easy', 'starter', 'starter:bf83f7ab7804abe45caedcb417189454'),
  ('geography', 'Lake Titicaca lies between which two countries?', 'Peru and Bolivia', array['Chile and Argentina', 'Bolivia and Brazil', 'Peru and Ecuador'], 'medium', 'starter', 'starter:73196b9806fc08f1ed490338ac846dc3'),
  ('geography', 'Most of the Amazon River flows through which country?', 'Brazil', array['Peru', 'Colombia', 'Venezuela'], 'easy', 'starter', 'starter:4137f6f87ae5a6c037fad73562038ecf'),
  ('geography', 'Which country is known as the ''Land of the Rising Sun''?', 'Japan', array['South Korea', 'China', 'Taiwan'], 'easy', 'starter', 'starter:4822dc471f5c84afcc69b721984814f3'),
  ('geography', 'What is Malaysia''s highest mountain?', 'Mount Kinabalu', array['Gunung Mulu', 'Gunung Tahan', 'Mount Murud'], 'easy', 'starter', 'starter:b83d213c768c0ee57cd11bb3a04e2485'),
  ('geography', 'Gotland, the largest island in the Baltic Sea, belongs to which country?', 'Sweden', array['Finland', 'Estonia', 'Denmark'], 'medium', 'starter', 'starter:f9cbfb840e7a60e79d13d4c9d792803e'),
  ('geography', 'Which European capital is built on 14 islands?', 'Stockholm', array['Copenhagen', 'Amsterdam', 'Venice'], 'medium', 'starter', 'starter:0d04c7f74c0fbdbc489ce70294bf6af8'),
  ('geography', 'The Drake Passage separates South America from…', 'Antarctica', array['Africa', 'Australia', 'The Falkland Islands'], 'medium', 'starter', 'starter:5c9b634cce44593671df6f28e126fb20'),
  ('history', 'In which year did Malaya become independent?', '1957', array['1963', '1945', '1965'], 'easy', 'starter', 'starter:ffb0c7ccb83ee4f55ae6b6a054c52ffd'),
  ('history', 'In which year did Sarawak join Malaysia?', '1963', array['1957', '1946', '1971'], 'easy', 'starter', 'starter:d807ae5320814dc3c3571e18a6a21cfa'),
  ('history', 'Roughly when was the Sultanate of Malacca founded?', 'Around 1400', array['Around 1100', 'Around 1600', 'Around 1800'], 'medium', 'starter', 'starter:176fd1e3d0e42fcbe71b9d2ec867fe60'),
  ('history', 'In which country is Angkor Wat?', 'Cambodia', array['Thailand', 'Laos', 'Vietnam'], 'easy', 'starter', 'starter:e18ab2dbabf6162c865e692ea991d997'),
  ('history', 'Which Viking explorer reached North America around the year 1000?', 'Leif Erikson', array['Erik the Red', 'Ragnar Lothbrok', 'Harald Hardrada'], 'medium', 'starter', 'starter:e7b4462affc694115b3922bf7a61872e'),
  ('history', 'Which 17th-century Swedish king made Sweden a great power in Europe?', 'Gustavus Adolphus', array['Charles XII', 'Gustav Vasa', 'Carl XVI Gustaf'], 'hard', 'starter', 'starter:2ce634e65d14fbea6c5c1c9f96881030'),
  ('history', 'Which Swedish warship sank on its first voyage in 1628 and is now in a Stockholm museum?', 'Vasa', array['Kronan', 'Viking', 'Svea'], 'medium', 'starter', 'starter:a697d0f5fc0a773f7cbaf4ce48ea4f62'),
  ('history', 'Which Chilean was elected president in 1970?', 'Salvador Allende', array['Augusto Pinochet', 'Michelle Bachelet', 'Bernardo O''Higgins'], 'medium', 'starter', 'starter:256d4ab7a6a2b4fb9450547e13004eaa'),
  ('history', 'Who was Chile''s first woman president?', 'Michelle Bachelet', array['Gabriela Mistral', 'Isabel Allende', 'Violeta Parra'], 'medium', 'starter', 'starter:f770941a8d34e1334232a67c76ce796d'),
  ('history', 'What was the capital of the Inca Empire?', 'Cusco', array['Lima', 'Quito', 'La Paz'], 'medium', 'starter', 'starter:258d1003372ad874151b0d91d9cb6cf2'),
  ('history', 'Genghis Khan founded which empire?', 'The Mongol Empire', array['The Ottoman Empire', 'The Mughal Empire', 'The Khmer Empire'], 'easy', 'starter', 'starter:4e535f70aca1d4055abc5cfc9c148816'),
  ('history', 'Which city was Japan''s capital for over 1,000 years before Tokyo?', 'Kyoto', array['Osaka', 'Nara', 'Hiroshima'], 'medium', 'starter', 'starter:aa061256e119784d3219258817d4ce47'),
  ('history', 'Which Chinese admiral''s great fleets visited Malacca in the 1400s?', 'Zheng He', array['Kublai Khan', 'Sun Yat-sen', 'Confucius'], 'hard', 'starter', 'starter:7f449bedfe6ef45c88daba678ac13441'),
  ('history', 'In which year were the first Nobel Prizes awarded?', '1901', array['1895', '1920', '1888'], 'medium', 'starter', 'starter:c91096622584e3b1999737d1b3884458'),
  ('history', 'Bernardo O''Higgins is remembered in Chile as…', 'A leader of Chile''s independence', array['Its first poet', 'The founder of Santiago', 'A famous footballer'], 'medium', 'starter', 'starter:4b4a082d938e230f5e5f6b43c79d0ec2'),
  ('food', 'Kolo mee is a famous noodle dish from…', 'Sarawak', array['Penang', 'Singapore', 'Bangkok'], 'easy', 'starter', 'starter:1a451c7eccc7b58cfe3e135ea04db220'),
  ('food', 'Manok pansoh is chicken cooked inside…', 'Bamboo', array['A clay pot', 'Banana leaves', 'A coconut'], 'easy', 'starter', 'starter:cc160cb1ac6b65d8bf3131d40e4d07ed'),
  ('food', 'Tom yum soup comes from which country?', 'Thailand', array['Vietnam', 'Malaysia', 'Laos'], 'easy', 'starter', 'starter:10c7c757527017f92bc34dc855b0c972'),
  ('food', 'Adobo is an iconic dish of which country?', 'The Philippines', array['Indonesia', 'Thailand', 'Brunei'], 'easy', 'starter', 'starter:3004a35bca0efb896df86aa24cb00460'),
  ('food', 'Rendang is usually made with which meat?', 'Beef', array['Pork', 'Duck', 'Fish'], 'easy', 'starter', 'starter:3187fb63bbac0273b9b2972354fa4b5e'),
  ('food', 'What is a Swedish smörgåstårta?', 'A sandwich cake', array['A cinnamon bun', 'A fish soup', 'A berry pie'], 'medium', 'starter', 'starter:5cf3f25f368098777f3e5c68d7b4ae85'),
  ('food', 'What is the main flavour of a Swedish kanelbulle?', 'Cinnamon', array['Cardamom', 'Vanilla', 'Lingonberry'], 'easy', 'starter', 'starter:a1b6bb7aae2481e817148c19dee29fd8'),
  ('food', 'In Sweden, the cream-filled semla bun is traditionally eaten around…', 'Shrove Tuesday (Lent)', array['Midsummer', 'Christmas Eve', 'National Day'], 'hard', 'starter', 'starter:e5b1813251f9dff9cc4b10415f785ca9'),
  ('food', 'A Chilean ''completo'' is a…', 'Hot dog with avocado, tomato and mayo', array['Seafood stew', 'Corn pie', 'Sweet pastry'], 'medium', 'starter', 'starter:b22c4e130edf89a8f3ac7575251a0ce1'),
  ('food', 'What is the main ingredient of Chilean pastel de choclo?', 'Corn', array['Potato', 'Rice', 'Pumpkin'], 'medium', 'starter', 'starter:aec67f48985ce4b2da9ed13828537f34'),
  ('food', 'Mote con huesillo is a Chilean drink made with…', 'Dried peaches and wheat', array['Coffee and milk', 'Grapes and honey', 'Coconut and lime'], 'hard', 'starter', 'starter:e37a47f197b0789cc9dd336f23e739fa'),
  ('food', 'Dim sum comes from which cuisine?', 'Cantonese (southern China)', array['Japanese', 'Korean', 'Thai'], 'medium', 'starter', 'starter:204c62f3c2baa17c2e8c8be90ac43431'),
  ('food', 'Kimchi is most often made with which vegetable?', 'Napa cabbage', array['Carrot', 'Spinach', 'Eggplant'], 'easy', 'starter', 'starter:0e8f4d0be25dc5982a561e1bed9fccc1'),
  ('food', 'What is satay?', 'Grilled meat skewers with peanut sauce', array['Fried rice with egg', 'Coconut rice cake', 'Spicy noodle soup'], 'easy', 'starter', 'starter:c1d61c88cee20a4adf7fdc12b2a4e73e'),
  ('food', 'In ceviche, the raw fish is ''cooked'' in…', 'Citrus juice', array['Coconut milk', 'Vinegar and soy sauce', 'Hot oil'], 'easy', 'starter', 'starter:392d4c4c0c1cadb050b3dc4058e1c946'),
  ('music', 'How many members does the K-pop group Blackpink have?', '4', array['5', '3', '7'], 'easy', 'starter', 'starter:c1e7e696a7041c7ead9b1e92396b7226'),
  ('music', 'Roxette''s ''It Must Have Been Love'' became famous through which film?', 'Pretty Woman', array['Titanic', 'Notting Hill', 'Dirty Dancing'], 'medium', 'starter', 'starter:a1eed5651f5672f87e0b9f7a46a40ce2'),
  ('music', 'Which Swedish singer won Eurovision in both 2012 and 2023?', 'Loreen', array['Zara Larsson', 'Robyn', 'Måns Zelmerlöw'], 'medium', 'starter', 'starter:580ef1d663f3841de672b23586674e1a'),
  ('music', 'YOASOBI''s hit ''Idol'' is the theme of which anime?', 'Oshi no Ko', array['Demon Slayer', 'Spy x Family', 'Jujutsu Kaisen'], 'hard', 'starter', 'starter:4c7540a4c79da32616581f9e50b2b33f'),
  ('music', 'Gamelan music comes from which country?', 'Indonesia', array['Japan', 'India', 'Philippines'], 'easy', 'starter', 'starter:32daee484b95c1c27ed54d7ee4c81e92'),
  ('music', 'The sitar is a traditional instrument from…', 'India', array['Turkey', 'China', 'Iran'], 'easy', 'starter', 'starter:93798c258c619da7858e3e75b28542c9'),
  ('music', 'Bossa nova music was born in which country?', 'Brazil', array['Cuba', 'Argentina', 'Spain'], 'medium', 'starter', 'starter:f06d9c397b573a1d2b7e0e3795721cb4'),
  ('music', 'The tango was born in the Río de la Plata region of…', 'Argentina and Uruguay', array['Spain and Portugal', 'Chile and Peru', 'Mexico and Cuba'], 'medium', 'starter', 'starter:0324f77866cab20c59aae9cfb2dc0def'),
  ('music', 'Víctor Jara was a famous…', 'Chilean singer-songwriter', array['Argentine footballer', 'Mexican painter', 'Peruvian poet'], 'medium', 'starter', 'starter:4f95d250c362ad3ac67bc909dc84e73d'),
  ('music', 'The DJ trio Swedish House Mafia comes from…', 'Sweden', array['Italy', 'Netherlands', 'United States'], 'easy', 'starter', 'starter:95a71b9a4739e876efaf55834c608ec9'),
  ('music', 'The sape is traditionally played by which peoples of Sarawak?', 'Orang Ulu', array['Bidayuh', 'Melanau', 'Malay'], 'medium', 'starter', 'starter:659d84475955ee03332661f2a49cd972'),
  ('music', 'Singer Shakira comes from which country?', 'Colombia', array['Mexico', 'Spain', 'Venezuela'], 'easy', 'starter', 'starter:6003cbd42670469c52f6c5bff709b4cd'),
  ('music', 'What is the angklung, a Southeast Asian instrument, made of?', 'Bamboo', array['Bronze', 'Coconut shell', 'Animal skin'], 'medium', 'starter', 'starter:0ccf95c6f6307c45d63cc1b25adde2ef'),
  ('music', 'Which Korean singer''s ''Gangnam Style'' went viral in 2012?', 'PSY', array['G-Dragon', 'Rain', 'Jungkook'], 'easy', 'starter', 'starter:54fe612b5d738eec6a2d4837c5339524'),
  ('music', 'ABBA comes from which city?', 'Stockholm', array['Gothenburg', 'Oslo', 'Copenhagen'], 'easy', 'starter', 'starter:a06a99ab8a9c926872b03192c3c9f220'),
  ('movies', 'Which Japanese director made ''Seven Samurai''?', 'Akira Kurosawa', array['Hayao Miyazaki', 'Takeshi Kitano', 'Hirokazu Kore-eda'], 'medium', 'starter', 'starter:ebe8b915fdc1a53c263df43f2802b3ee'),
  ('movies', 'Who directed ''Crouching Tiger, Hidden Dragon''?', 'Ang Lee', array['Zhang Yimou', 'Wong Kar-wai', 'John Woo'], 'medium', 'starter', 'starter:e04c48d945e19b690621a9d3d3cd3575'),
  ('movies', 'Bollywood is based in which city?', 'Mumbai', array['Delhi', 'Kolkata', 'Chennai'], 'easy', 'starter', 'starter:485cc806b4f29359fd37143cc8a4701f'),
  ('movies', 'Who directed ''Parasite''?', 'Bong Joon-ho', array['Park Chan-wook', 'Kim Ki-duk', 'Lee Chang-dong'], 'medium', 'starter', 'starter:c51b95832a0aa0be1766dfe3b3f6912a'),
  ('movies', 'Which Swedish director won the Palme d''Or for ''Triangle of Sadness''?', 'Ruben Östlund', array['Ingmar Bergman', 'Lukas Moodysson', 'Tomas Alfredson'], 'hard', 'starter', 'starter:3e9a16ddf86a693de6c7d0914b53933f'),
  ('movies', 'The Swedish film ''Let the Right One In'' is about a friendship with a…', 'Vampire', array['Robot', 'Ghost', 'Troll'], 'medium', 'starter', 'starter:eed7f64f23df39102130ef4ff7c88275'),
  ('movies', 'The Chilean film ''A Fantastic Woman'' won which Oscar?', 'Best International Feature Film', array['Best Picture', 'Best Actress', 'Best Animated Feature'], 'hard', 'starter', 'starter:63af58a52d8005ed708e8fa8e2e4afb2'),
  ('movies', 'The animated series ''Upin & Ipin'' comes from which country?', 'Malaysia', array['Indonesia', 'Singapore', 'Thailand'], 'easy', 'starter', 'starter:9c0060e17ae90343bffbbfe9a28a2e1f'),
  ('movies', 'The ''Ip Man'' films are about a master of which martial art?', 'Wing Chun', array['Karate', 'Taekwondo', 'Judo'], 'medium', 'starter', 'starter:86834225b88a632acf68d8ed0a64dd93'),
  ('movies', 'In which country is the Cannes Film Festival held?', 'France', array['Italy', 'Spain', 'Monaco'], 'easy', 'starter', 'starter:b2e5b7369818fe027a5447dd6be4382a'),
  ('movies', '''Crazy Rich Asians'' is mostly set in which country?', 'Singapore', array['Malaysia', 'Hong Kong', 'Thailand'], 'easy', 'starter', 'starter:e17295e8de1a73183726685aa2a94373'),
  ('movies', '''Train to Busan'' comes from which country?', 'South Korea', array['Japan', 'China', 'Taiwan'], 'easy', 'starter', 'starter:784482100deb5139a044df5a4f458bc5'),
  ('movies', 'Detective Kurt Wallander works in which Swedish town?', 'Ystad', array['Lund', 'Kiruna', 'Uppsala'], 'medium', 'starter', 'starter:4f85530fc470612c37eb6c1260da8e2d'),
  ('movies', 'What is the original Spanish title of ''Money Heist''?', 'La casa de papel', array['El robo perfecto', 'La banda', 'El profesor'], 'medium', 'starter', 'starter:9a30f6e36fe5d5ef139caf7af38d88cd'),
  ('movies', 'The Brazilian film ''City of God'' is set in…', 'Rio de Janeiro', array['São Paulo', 'Buenos Aires', 'Lima'], 'medium', 'starter', 'starter:6b3f1cdfe15e65eb49063512bc56eca8'),
  ('sport', 'Which Malaysian became the world''s number 1 squash player?', 'Nicol David', array['Lee Chong Wei', 'Azizulhasni Awang', 'Pandelela Rinong'], 'easy', 'starter', 'starter:257f6001be6f9d03238aa18ef66c9b9c'),
  ('sport', 'A traditional sepak takraw ball is made of…', 'Rattan', array['Leather', 'Rubber', 'Bamboo leaves'], 'medium', 'starter', 'starter:8b0c33210f5d0d438507338b60a58455'),
  ('sport', 'The martial art pencak silat comes from…', 'The Malay world of Southeast Asia', array['Japan', 'Korea', 'Brazil'], 'medium', 'starter', 'starter:0b5ceadd237c424e809f7f5923f4e665'),
  ('sport', 'In which year did Sweden host the FIFA World Cup?', '1958', array['1974', '1994', '2006'], 'hard', 'starter', 'starter:86493af089d8e6170b35e2ddc80d161a'),
  ('sport', 'How many World Cups did Pelé win with Brazil?', '3', array['2', '4', '1'], 'medium', 'starter', 'starter:347d583df83535f0fcd0450588613b7d'),
  ('sport', 'Which Chilean won Olympic gold in men''s singles tennis in 2004?', 'Nicolás Massú', array['Marcelo Ríos', 'Fernando González', 'Alexis Sánchez'], 'hard', 'starter', 'starter:bef0593c70580855026fc1cac6e89657'),
  ('sport', 'Muay Thai is the national sport of which country?', 'Thailand', array['Cambodia', 'Vietnam', 'Myanmar'], 'easy', 'starter', 'starter:bcd2b1e9ec97158bf031043061f87152'),
  ('sport', 'Sumo wrestling comes from which country?', 'Japan', array['Mongolia', 'China', 'Korea'], 'easy', 'starter', 'starter:876d6b71824021219500f5304b757539'),
  ('sport', 'Which Swedish tennis player won seven Grand Slam singles titles in the 1980s?', 'Mats Wilander', array['Stefan Edberg', 'Björn Borg', 'Robin Söderling'], 'hard', 'starter', 'starter:492899de1f6055617a2af73ab1f97234'),
  ('sport', 'Taekwondo comes from which country?', 'Korea', array['Japan', 'China', 'Thailand'], 'easy', 'starter', 'starter:8e138625dd6bd73f533e5bb48c40a508'),
  ('sport', 'The Copa América is a tournament for…', 'South American national football teams', array['American college basketball', 'Caribbean cricket teams', 'Latin American boxers'], 'easy', 'starter', 'starter:5b5aaf1fa078f0569b42bdb369d59afc'),
  ('sport', 'How many players are on a sepak takraw team (regu) on court?', '3', array['2', '5', '6'], 'medium', 'starter', 'starter:eccab056f3d8468164493d9d89c66acf'),
  ('sport', 'Which country has won badminton''s Thomas Cup the most times?', 'Indonesia', array['China', 'Malaysia', 'Denmark'], 'hard', 'starter', 'starter:cc7ed810346bdf2cc55c221673972a62'),
  ('sport', 'Pole-vault world record holder Armand ''Mondo'' Duplantis competes for…', 'Sweden', array['United States', 'France', 'Norway'], 'medium', 'starter', 'starter:32905f0dde83582a67a8da62d0feab90'),
  ('sport', 'Which country hosts the Tour de France cycling race?', 'France', array['Italy', 'Spain', 'Belgium'], 'easy', 'starter', 'starter:a5c63919e98f6cc8bd272dbdef5016c2'),
  ('animals', 'Wild orangutans live only on Borneo and which other island?', 'Sumatra', array['Java', 'Sulawesi', 'Bali'], 'easy', 'starter', 'starter:a9ced8bf8c6e5e6baa546d9fcf6dbad7'),
  ('animals', 'The sun bear of Borneo is the world''s smallest…', 'Bear', array['Cat', 'Monkey', 'Deer'], 'easy', 'starter', 'starter:d3173b05c239c7b7a58ea56458335a3f'),
  ('animals', 'Komodo dragons live in which country?', 'Indonesia', array['Malaysia', 'Philippines', 'Australia'], 'easy', 'starter', 'starter:423a64824f5bb857697eaafd6d489b3d'),
  ('animals', 'In which deer species do both males and females grow antlers?', 'Reindeer', array['Moose', 'Red deer', 'Roe deer'], 'medium', 'starter', 'starter:e182bd064151694ecc753dfbd70e7f2d'),
  ('animals', 'The Eurasian lynx, found in Sweden, is a wild…', 'Cat', array['Dog', 'Weasel', 'Bear'], 'easy', 'starter', 'starter:0a4d41e34a97e413f9c12bb47e6da129'),
  ('animals', 'Llamas and alpacas are close relatives of…', 'Camels', array['Horses', 'Sheep', 'Goats'], 'medium', 'starter', 'starter:f09e1716df54bbb52d0c9ea0d969f2aa'),
  ('animals', 'Where do wild guanacos live?', 'South America', array['Africa', 'Australia', 'Asia'], 'easy', 'starter', 'starter:712346db2b5727f803940f88358fd4e6'),
  ('animals', 'Humboldt penguins live along the coasts of…', 'Chile and Peru', array['Sweden and Norway', 'Malaysia and Indonesia', 'Argentina and Uruguay'], 'medium', 'starter', 'starter:fd185a7d670c60784dc6afaf8a5592f6'),
  ('animals', 'Which wild cat lives in the rainforests of Borneo?', 'Sunda clouded leopard', array['Tiger', 'Jaguar', 'Snow leopard'], 'medium', 'starter', 'starter:54a7a14b486e12924060b2f69afaf259'),
  ('animals', 'A pangolin''s scales are made of…', 'Keratin', array['Bone', 'Shell', 'Wood-like bark'], 'medium', 'starter', 'starter:2f4e7f546dab0963603fb63ea97c23b7'),
  ('animals', 'In Malay folk tales, Sang Kancil is a clever…', 'Mouse-deer', array['Monkey', 'Crocodile', 'Tortoise'], 'easy', 'starter', 'starter:ae2d319ccd0d4f14124fdf74d6061c17'),
  ('animals', 'The tarsier is famous for its…', 'Huge eyes', array['Long tail feathers', 'Blue tongue', 'Webbed feet'], 'easy', 'starter', 'starter:b3245fcc5aa7cdb3534fe71f47e15fb1'),
  ('animals', 'What is Chile''s national bird?', 'Andean condor', array['Hummingbird', 'Flamingo', 'Penguin'], 'medium', 'starter', 'starter:1b9bde46feb7881c8a961381ecff350b'),
  ('animals', 'What is a dugong also called?', 'Sea cow', array['Sea lion', 'Sea horse', 'Sea dog'], 'easy', 'starter', 'starter:35b59a560d2675dd817cd0eb850d75a0'),
  ('animals', 'What happens to an Arctic fox''s fur in winter?', 'It turns white', array['It falls out', 'It turns red', 'It turns black'], 'easy', 'starter', 'starter:c61282a0702324bb9ce7c5b1242c926e')
on conflict (external_key) do nothing;

-- ------------------------------------------------------------ personality quizzes
create table public.personality_results (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  quiz_code        text not null check (quiz_code in ('bornean_animal', 'fika_treat', 'ld_superpower', 'travel', 'chile_landscape', 'date_night', 'texting', 'cosy_weekend', 'festival', 'kitchen', 'show_love', 'lark_owl')),
  user_id          uuid not null references auth.users (id) on delete cascade,
  answers          int[] not null check (array_length(answers, 1) = 6),
  result           int not null check (result between 0 and 3),
  guess            int check (guess between 0 and 3),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (relationship_id, quiz_code, user_id)
);
create trigger personality_results_touch before update on public.personality_results
  for each row execute function public.touch_updated_at();
alter table public.personality_results enable row level security;
revoke all on public.personality_results from anon, authenticated;

-- The result you lean to most (a tie goes to the first) — same rule as the app.
create or replace function public.personality_result(p_answers int[])
returns int language sql immutable set search_path = '' as $$
  select r from (select r, (select count(*) from unnest(p_answers) a where a = r) c from generate_series(0, 3) r) s
   order by c desc, r limit 1;
$$;

create or replace function public.personality_submit(p_quiz text, p_answers int[], p_guess int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  res int;
begin
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'Quiz Time opens once your partner has joined.' using errcode = 'P0001';
  end if;
  if p_quiz not in ('bornean_animal', 'fika_treat', 'ld_superpower', 'travel', 'chile_landscape', 'date_night', 'texting', 'cosy_weekend', 'festival', 'kitchen', 'show_love', 'lark_owl') then raise exception 'Unknown quiz.' using errcode = '22023'; end if;
  if coalesce(array_length(p_answers, 1), 0) <> 6 or exists (select 1 from unnest(p_answers) a where a is null or a not between 0 and 3) then
    raise exception 'Answer all six questions.' using errcode = '22023';
  end if;
  if p_guess is not null and p_guess not between 0 and 3 then raise exception 'Unknown guess.' using errcode = '22023'; end if;
  res := public.personality_result(p_answers);
  insert into public.personality_results (relationship_id, quiz_code, user_id, answers, result, guess)
  values (rel, p_quiz, uid, p_answers, res, p_guess)
  on conflict (relationship_id, quiz_code, user_id) do update
    set answers = excluded.answers, result = excluded.result;   -- the first guess stays
  return res;
end;
$$;

-- Your results, and your partner's only for quizzes you've taken too.
create or replace function public.personality_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() uid, public.my_relationship_id() rel)
  select coalesce(jsonb_agg(jsonb_build_object(
           'quiz', c.quiz_code,
           'my_row', mine.id,
           'mine', case when mine.id is null then null else jsonb_build_object('result', mine.result, 'guess', mine.guess, 'at', mine.updated_at) end,
           'partner_taken', theirs.id is not null,
           'partner', case when mine.id is null or theirs.id is null then null
                           else jsonb_build_object('result', theirs.result, 'guess', theirs.guess, 'at', theirs.updated_at) end)), '[]'::jsonb)
    from me
    cross join lateral (select distinct p.quiz_code from public.personality_results p where p.relationship_id = me.rel) c
    left join public.personality_results mine on mine.relationship_id = me.rel and mine.quiz_code = c.quiz_code and mine.user_id = me.uid
    left join public.personality_results theirs on theirs.relationship_id = me.rel and theirs.quiz_code = c.quiz_code and theirs.user_id <> me.uid;
$$;

-- ------------------------------------------------------ scrapbook: kind 'personality'
alter table public.scrapbook_entries drop constraint if exists scrapbook_entries_kind_check;
alter table public.scrapbook_entries add constraint scrapbook_entries_kind_check
  check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality'));

create or replace function public.scrapbook_item_ok(p_rel uuid, p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'ritual'    then exists (select 1 from public.weekly_activities w where w.id = p_ref and w.relationship_id = p_rel) and public.week_revealed(p_ref)
    when 'mission'   then exists (select 1 from public.apart_missions m where m.id = p_ref and m.relationship_id = p_rel) and public.apart_visible(p_ref)
    when 'letter'    then exists (select 1 from public.letters l where l.id = p_ref and l.relationship_id = p_rel and public.letter_arrived(l))
    when 'discovery' then exists (select 1 from public.curious_discoveries d where d.id = p_ref and d.relationship_id = p_rel)
    when 'milestone' then exists (select 1 from public.milestones x where x.id = p_ref and x.relationship_id = p_rel)
    when 'moment'    then exists (select 1 from public.moments x where x.id = p_ref and x.relationship_id = p_rel)
    when 'personality' then exists (select 1 from public.personality_results x where x.id = p_ref and x.relationship_id = p_rel
                                    and (select count(*) from public.personality_results y where y.relationship_id = p_rel and y.quiz_code = x.quiz_code) = 2)
    when 'quiz'      then exists (select 1 from public.quiz_matches x where x.id = p_ref and x.relationship_id = p_rel and x.status = 'finished')
    when 'whim'      then exists (select 1 from public.whims x where x.id = p_ref and x.relationship_id = p_rel and public.whim_came_true(x))
    else false end;
$$;

create or replace function public.set_scrapbook_entry(p_kind text, p_ref uuid, p_saved boolean default true, p_caption text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  c   text := case when p_caption is null then null else trim(p_caption) end;
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality') then
    raise exception 'Unknown kind of memory.' using errcode = '22023';
  end if;
  if c is not null and char_length(c) > 300 then
    raise exception 'Please keep captions under 300 characters.' using errcode = '22001';
  end if;
  if not public.scrapbook_item_ok(rel, p_kind, p_ref) then
    raise exception 'That can be saved once it''s open to both of you.' using errcode = 'P0001';
  end if;
  insert into public.scrapbook_entries (relationship_id, kind, ref_id, saved, caption, saved_by)
  values (rel, p_kind, p_ref, coalesce(p_saved, true), coalesce(c, ''), auth.uid())
  on conflict (relationship_id, kind, ref_id) do update
    set saved = coalesce(p_saved, scrapbook_entries.saved),
        caption = coalesce(c, scrapbook_entries.caption),
        saved_by = case when p_saved then auth.uid() else scrapbook_entries.saved_by end,
        updated_at = now();
end;
$$;

create or replace function public.scrapbook_feed()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
begin
  if rel is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.item order by x.at desc)
      from (
        -- weekly rituals (saved, revealed)
        select w.week_start as at, jsonb_build_object(
                 'kind', 'ritual', 'ref_id', w.id, 'at', w.week_start, 'caption', e.caption,
                 'title', a.title, 'category', a.category, 'week_number', w.week_number,
                 'authors', (select jsonb_agg(s.user_id) from public.activity_submissions s where s.weekly_activity_id = w.id and s.status = 'submitted'),
                 'parts', (select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'body', s.body, 'answers', s.answers, 'link_url', s.link_url,
                                                              'image_path', s.image_path, 'voice_path', s.voice_path, 'voice_seconds', s.voice_seconds))
                             from public.activity_submissions s where s.weekly_activity_id = w.id and s.status = 'submitted')) as item
          from public.scrapbook_entries e
          join public.weekly_activities w on w.id = e.ref_id and w.relationship_id = rel
          join public.activities a on a.id = w.activity_id
         where e.relationship_id = rel and e.kind = 'ritual' and e.saved and public.week_revealed(w.id)
        union all
        -- Apart missions (saved, open to both)
        select m.created_at, jsonb_build_object(
                 'kind', 'mission', 'ref_id', m.id, 'at', m.created_at, 'caption', e.caption, 'title', pa.title, 'category', pa.category,
                 'authors', (select jsonb_agg(distinct en.user_id) from public.apart_entries en where en.mission_id = m.id),
                 'parts', (select jsonb_agg(jsonb_build_object('user_id', en.user_id, 'body', en.body, 'link_url', en.link_url,
                                                              'image_path', en.image_path, 'voice_path', en.voice_path, 'voice_seconds', en.voice_seconds) order by en.created_at)
                             from public.apart_entries en where en.mission_id = m.id))
          from public.scrapbook_entries e
          join public.apart_missions m on m.id = e.ref_id and m.relationship_id = rel
          join public.play_activities pa on pa.id = m.activity_id
         where e.relationship_id = rel and e.kind = 'mission' and e.saved and public.apart_visible(m.id)
        union all
        -- loved letters (automatic)
        select coalesce(l.reveal_at, l.sent_at), jsonb_build_object(
                 'kind', 'letter', 'ref_id', l.id, 'at', coalesce(l.reveal_at, l.sent_at), 'caption', coalesce(e.caption, ''),
                 'title', l.title, 'letter_kind', l.kind, 'authors', jsonb_build_array(l.sender_id),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', l.sender_id, 'body', l.body, 'image_path', l.image_path,
                                                               'voice_path', l.voice_path, 'voice_seconds', l.voice_seconds)))
          from public.letters l
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'letter' and e.ref_id = l.id
         where l.relationship_id = rel and l.loved and public.letter_arrived(l) and coalesce(e.saved, true)
        union all
        -- Curious Club discoveries (automatic)
        select d.created_at, jsonb_build_object(
                 'kind', 'discovery', 'ref_id', d.id, 'at', d.created_at, 'caption', coalesce(e.caption, ''),
                 'title', coalesce(t.title, 'A discovery'), 'area', t.area, 'authors', jsonb_build_array(d.user_id),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', d.user_id, 'body', d.body)))
          from public.curious_discoveries d
          left join public.curious_topics t on t.id = d.topic_id
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'discovery' and e.ref_id = d.id
         where d.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- Our Story milestones (automatic)
        select coalesce(x.happened_on::timestamptz, x.created_at), jsonb_build_object(
                 'kind', 'milestone', 'ref_id', x.id, 'at', coalesce(x.happened_on::timestamptz, x.created_at), 'caption', coalesce(e.caption, ''),
                 'title', x.title, 'milestone_kind', x.kind, 'authors', case when x.created_by is null then '[]'::jsonb else jsonb_build_array(x.created_by) end,
                 'parts', jsonb_build_array(jsonb_build_object('user_id', x.created_by, 'body', x.note)))
          from public.milestones x
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'milestone' and e.ref_id = x.id
         where x.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- trips & moments
        select x.starts_on::timestamptz, jsonb_build_object(
                 'kind', 'moment', 'ref_id', x.id, 'at', x.starts_on, 'caption', x.caption,
                 'title', x.title, 'place', x.place, 'starts_on', x.starts_on, 'ends_on', x.ends_on,
                 'authors', (select coalesce(jsonb_agg(distinct u), '[]'::jsonb) from (select x.created_by u union select p.added_by from public.moment_photos p where p.moment_id = x.id) q where u is not null),
                 'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'taken_at', p.taken_at) order by p.position), '[]'::jsonb)
                              from public.moment_photos p where p.moment_id = x.id))
          from public.moments x
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'moment' and e.ref_id = x.id
         where x.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- wishes that came true (saved from the Whims list)
        select coalesce(w.revealed_at, w.status_at), jsonb_build_object(
                 'kind', 'whim', 'ref_id', w.id, 'at', coalesce(w.revealed_at, w.status_at), 'caption', e.caption,
                 'title', w.name, 'whim_kind', w.kind, 'authors', jsonb_build_array(w.created_by),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', w.created_by, 'body', w.message, 'image_path', w.photo_path, 'bucket', 'whims')))
          from public.scrapbook_entries e
          join public.whims w on w.id = e.ref_id and w.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'whim' and e.saved and public.whim_came_true(w)
        union all
        -- Quiz Duel results (saved after a match)
        select qm.finished_at, jsonb_build_object(
                 'kind', 'quiz', 'ref_id', qm.id, 'at', qm.finished_at, 'caption', e.caption, 'title', 'Quiz Duel',
                 'authors', (select coalesce(jsonb_agg(distinct a.user_id), '[]'::jsonb) from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id where r.match_id = qm.id),
                 'scores', (select jsonb_object_agg(z.u, z.s) from (select a.user_id::text u, count(*) filter (where a.correct)::int s
                              from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id where r.match_id = qm.id group by a.user_id) z),
                 'categories', (select jsonb_agg(c.label order by r.round_no) from public.quiz_rounds r join public.quiz_categories c on c.code = r.category where r.match_id = qm.id))
          from public.scrapbook_entries e
          join public.quiz_matches qm on qm.id = e.ref_id and qm.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'quiz' and e.saved and qm.status = 'finished'
        union all
        -- personality quiz results, both of you side by side (saved after comparing)
        select (select max(y.updated_at) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
               jsonb_build_object('kind', 'personality', 'ref_id', pr.id, 'caption', e.caption, 'title', 'Personality quiz', 'quiz_code', pr.quiz_code,
                 'at', (select max(y.updated_at) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
                 'authors', (select jsonb_agg(y.user_id) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
                 'results', (select jsonb_object_agg(y.user_id::text, y.result) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code))
          from public.scrapbook_entries e
          join public.personality_results pr on pr.id = e.ref_id and pr.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'personality' and e.saved
           and (select count(*) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code) = 2
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.personality_result(int[]), public.personality_submit(text, int[], int), public.personality_state() from public, anon;
revoke execute on function public.personality_result(int[]) from authenticated;
grant execute on function public.personality_submit(text, int[], int), public.personality_state() to authenticated;
revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) from public, anon;
grant execute on function public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) to authenticated;
