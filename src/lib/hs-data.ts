/** HS Code database and category definitions — ported from v1 */

export interface HSEntry { c: string; d: string; k: string; comp?: boolean; compQ?: string; }

export const HS_CUSTOMS_NAMES: Record<string, string> = {
	'39': 'Plastic articles', '40': 'Rubber articles', '42': 'Bags/cases of textile', '44': 'Wooden articles',
	'48': 'Paper/cardboard articles', '49': 'Printed matter', '56': 'Cordage/netting', '57': 'Textile floor coverings',
	'59': 'Technical textiles', '61': 'Knitted apparel', '62': 'Woven apparel', '63': 'Made-up textile articles',
	'68': 'Concrete articles', '70': 'Glass articles', '73': 'Iron/steel articles', '76': 'Aluminium articles',
	'83': 'Base metal articles', '84': 'Machinery/mechanical appliances', '85': 'Electrical equipment',
	'87': 'Vehicles', '90': 'Measuring instruments', '94': 'Furniture/lighting/prefab', '95': 'Sports/toys/games', '96': 'Miscellaneous manufactured'
};

export interface HSCategory { id: string; name: string; icon: string; kw: string[]; ch: string[]; }

export const HS_CATS: HSCategory[] = [
	{ id: 'locks', name: 'Locks & Security Hardware', icon: '🔒', kw: ['lock', 'padlock', 'latch', 'bolt', 'deadbolt', 'key', 'keyed', 'combination', 'hasp', 'clasp', 'cam lock'], ch: ['83'] },
	{ id: 'furniture', name: 'Furniture & Seating', icon: '🪑', kw: ['chair', 'table', 'desk', 'shelf', 'cabinet', 'bench', 'seat', 'stool', 'rack', 'locker', 'podium', 'lectern', 'counter', 'bar', 'riser', 'platform', 'furniture'], ch: ['94'] },
	{ id: 'lighting', name: 'Lighting & Lamps', icon: '💡', kw: ['light', 'lamp', 'led', 'spotlight', 'flood', 'lantern', 'flashlight', 'torch', 'bulb', 'chandelier', 'lighting', 'illumin'], ch: ['85', '94'] },
	{ id: 'textiles', name: 'Textiles & Apparel', icon: '👕', kw: ['shirt', 'jersey', 'vest', 'jacket', 'pants', 'shorts', 'uniform', 'apparel', 'garment', 'hoodie', 'polo', 'tee', 'bib', 'tabard', 'scarf', 'glove', 'sock', 'hat', 'cap', 'wristband', 'headband', 'lanyard'], ch: ['61', '62', '63'] },
	{ id: 'textile_made', name: 'Made-up Textiles (Flags, Banners, Tents)', icon: '🏳️', kw: ['flag', 'banner', 'bunting', 'pennant', 'tent', 'canopy', 'tarp', 'curtain', 'drape', 'cover', 'tablecloth', 'towel', 'blanket', 'net', 'netting', 'mesh', 'shade', 'awning', 'wrap', 'strap', 'webbing', 'sleeve'], ch: ['56', '57', '59', '63'] },
	{ id: 'signs', name: 'Signs, Displays & Printed Matter', icon: '🪧', kw: ['sign', 'signage', 'display', 'poster', 'print', 'printed', 'wayfinding', 'directional', 'board', 'scoreboard', 'billboard', 'graphic', 'decal', 'sticker', 'label', 'brochure', 'flyer', 'program', 'credential', 'ticket', 'pass', 'badge', 'accreditation', 'certificate'], ch: ['49', '83', '85'] },
	{ id: 'plastic', name: 'Plastic Articles', icon: '🧴', kw: ['plastic', 'pvc', 'polyethylene', 'polypropylene', 'acrylic', 'polycarbonate', 'vinyl', 'cone', 'stanchion', 'bollard', 'barrier', 'bin', 'tote', 'container', 'cup', 'plate', 'cutlery', 'disposable', 'badge holder', 'credential holder', 'wristband'], ch: ['39'] },
	{ id: 'electronics', name: 'Electronics & AV Equipment', icon: '📺', kw: ['camera', 'monitor', 'screen', 'tv', 'television', 'projector', 'speaker', 'microphone', 'amplifier', 'mixer', 'radio', 'walkie', 'intercom', 'router', 'switch', 'wifi', 'cable', 'cord', 'wire', 'power', 'charger', 'battery', 'usb', 'hdmi', 'ethernet', 'led screen', 'digital'], ch: ['85'] },
	{ id: 'steel', name: 'Iron & Steel Articles', icon: '⚙️', kw: ['steel', 'iron', 'metal', 'fence', 'rail', 'guard', 'post', 'bracket', 'clamp', 'bolt', 'screw', 'nail', 'chain', 'hook', 'wire', 'mesh', 'grate', 'frame', 'truss', 'scaffold', 'structure', 'barrier', 'jersey barrier', 'railing'], ch: ['73'] },
	{ id: 'aluminium', name: 'Aluminium Articles', icon: '🔩', kw: ['aluminium', 'aluminum', 'alloy', 'profile', 'extrusion', 'channel', 'rail', 'track', 'truss', 'frame', 'scaffold', 'ramp', 'platform'], ch: ['76'] },
	{ id: 'rubber', name: 'Rubber Articles', icon: '⚫', kw: ['rubber', 'foam', 'padding', 'cushion', 'mat', 'gasket', 'seal', 'bumper', 'grommet', 'conveyor'], ch: ['40'] },
	{ id: 'paper', name: 'Paper & Packaging', icon: '📦', kw: ['cardboard', 'carton', 'box', 'packaging', 'paper', 'bag', 'envelope', 'folder', 'binder', 'notebook', 'pad', 'tissue', 'napkin'], ch: ['48'] },
	{ id: 'sports', name: 'Sports & Games Equipment', icon: '⚽', kw: ['ball', 'football', 'soccer', 'basketball', 'goal', 'net', 'whistle', 'cone', 'marker', 'hurdle', 'training', 'agility', 'medal', 'trophy', 'podium', 'sport', 'game', 'exercise', 'gym', 'fitness', 'racket', 'bat'], ch: ['95'] },
	{ id: 'vehicles', name: 'Vehicles & Transport', icon: '🚛', kw: ['cart', 'truck', 'dolly', 'trolley', 'trailer', 'forklift', 'golf cart', 'vehicle', 'pallet truck', 'hand truck', 'barrow'], ch: ['87'] },
	{ id: 'machinery', name: 'Machinery & Appliances', icon: '🏗️', kw: ['machine', 'generator', 'pump', 'fan', 'air conditioner', 'cooler', 'freezer', 'refrigerator', 'heater', 'tool', 'drill', 'saw', 'compressor', 'blower', 'misting'], ch: ['84'] },
	{ id: 'wood', name: 'Wooden Articles', icon: '🪵', kw: ['wood', 'wooden', 'plywood', 'timber', 'pallet', 'crate', 'box'], ch: ['44'] },
	{ id: 'glass', name: 'Glass Articles', icon: '🥃', kw: ['glass', 'bottle', 'jar', 'tumbler', 'mug', 'pane', 'tempered', 'laminated'], ch: ['70'] },
	{ id: 'base_metal', name: 'Base Metal Hardware', icon: '🔧', kw: ['hinge', 'handle', 'knob', 'mount', 'fitting', 'hook', 'bracket', 'clip', 'stapler', 'trophy', 'medal', 'plaque', 'nameplate'], ch: ['83'] },
];

// Abbreviated HS DB — key entries for common FIFA event logistics items
export const HS_DB: HSEntry[] = [
	// Ch.39 Plastics
	{ c: '3918.90', d: 'Floor coverings of other plastics', k: 'plastic floor covering mat rubber flooring turf' },
	{ c: '3921.90', d: 'Other plates/sheets/film of plastics', k: 'plastic sheet plate film laminated acrylic polycarbonate' },
	{ c: '3923.10', d: 'Boxes, cases, crates of plastics', k: 'plastic box case crate container bin tote storage' },
	{ c: '3924.10', d: 'Tableware and kitchenware of plastics', k: 'plastic plate cup bowl tableware kitchenware utensil cutlery disposable' },
	{ c: '3926.20', d: 'Articles of apparel/accessories of plastics', k: 'plastic apparel glove apron raincoat vest bib wristband lanyard badge holder credential' },
	{ c: '3926.90', d: 'Other articles of plastics', k: 'plastic article sign display holder stand bracket clip tie strap cable barrier bollard cone stanchion' },
	// Ch.44 Wood
	{ c: '4415.10', d: 'Cases, boxes, crates of wood', k: 'wood wooden box case crate pallet container' },
	// Ch.48-49 Paper/Printed
	{ c: '4819.10', d: 'Cartons, boxes of corrugated paper/board', k: 'cardboard box carton corrugated packaging shipping' },
	{ c: '4911.10', d: 'Trade advertising material, catalogues', k: 'poster flyer catalogue catalog brochure advertising promotional print menu' },
	{ c: '4911.99', d: 'Other printed matter', k: 'printed matter document form certificate credential accreditation ticket pass' },
	// Ch.56-63 Textiles
	{ c: '5608.19', d: 'Knotted netting of man-made textile materials', k: 'net netting mesh goal net safety net barrier net sport' },
	{ c: '5705.00', d: 'Other carpets and textile floor coverings', k: 'carpet rug mat floor covering textile turf artificial grass' },
	{ c: '6109.10', d: 'T-shirts, singlets of cotton, knitted', k: 'tshirt t-shirt cotton knit crew neck tee shirt', comp: true, compQ: 'Fiber composition?' },
	{ c: '6109.90', d: 'T-shirts of other textile materials, knitted', k: 'tshirt t-shirt polyester synthetic knit jersey dri-fit performance', comp: true, compQ: 'Fiber composition?' },
	{ c: '6110.30', d: 'Jerseys, pullovers of man-made fibres, knitted', k: 'jersey pullover sweater hoodie polyester synthetic fleece zip jacket track', comp: true, compQ: 'Fiber composition?' },
	{ c: '6211.33', d: "Men's garments of man-made fibres, woven (other)", k: 'vest bib tabard apron uniform woven men synthetic', comp: true, compQ: 'Fiber composition?' },
	{ c: '6306.12', d: 'Tarpaulins of synthetic fibres', k: 'tarpaulin tarp cover shade sail canopy awning synthetic' },
	{ c: '6306.22', d: 'Tents of synthetic fibres', k: 'tent canopy pavilion marquee gazebo shelter pop-up popup' },
	{ c: '6307.90', d: 'Other made-up textile articles', k: 'textile article strap webbing belt sleeve cover wrap banner flag bunting pennant armband wristband' },
	// Ch.73 Iron/Steel
	{ c: '7308.90', d: 'Other structures of iron/steel', k: 'steel structure frame truss scaffolding tower mast pole stand support bracket' },
	{ c: '7326.20', d: 'Articles of iron/steel wire', k: 'steel wire article basket cage hook chain ring' },
	{ c: '7326.90', d: 'Other articles of iron or steel', k: 'steel article bracket plate clamp clip anchor hook ring chain barrier rail guard fence post' },
	// Ch.76 Aluminium
	{ c: '7610.90', d: 'Other aluminium structures', k: 'aluminium aluminum structure frame truss stand scaffold platform ramp' },
	{ c: '7616.99', d: 'Other articles of aluminium', k: 'aluminium aluminum article bracket plate clamp clip sign' },
	// Ch.83 Base metal
	{ c: '8301.10', d: 'Padlocks of base metal', k: 'padlock pad lock base metal keyed combination' },
	{ c: '8301.40', d: 'Other locks of base metal', k: 'lock padlock latch bolt dead bolt combination keyed cable lock' },
	{ c: '8302.41', d: 'Mountings/fittings for doors of base metal', k: 'hinge bracket mount fitting door handle knob pull push bar closer' },
	{ c: '8306.29', d: 'Other statuettes of base metal', k: 'trophy award medal plaque figurine statue metallic' },
	{ c: '8310.00', d: 'Sign-plates, name-plates of base metal', k: 'metal sign plate nameplate number letter plaque address directional wayfinding' },
	// Ch.84-85 Machinery/Electrical
	{ c: '8414.51', d: 'Table/floor fans with motor ≤125W', k: 'fan electric table floor standing desk pedestal portable cooling' },
	{ c: '8418.69', d: 'Other refrigerating/freezing equipment', k: 'refrigerator cooler cold room ice machine chiller' },
	{ c: '8471.30', d: 'Portable digital data processing machines <10kg', k: 'laptop computer notebook tablet portable pc' },
	{ c: '8517.62', d: 'Machines for reception/transmission of data', k: 'router modem switch access point wireless wifi network hub' },
	{ c: '8518.21', d: 'Single loudspeakers in enclosures', k: 'speaker loudspeaker cabinet monitor pa public address' },
	{ c: '8518.40', d: 'Audio-frequency electric amplifiers', k: 'amplifier amp mixer audio power processor dsp' },
	{ c: '8525.81', d: 'Television cameras and digital cameras', k: 'camera video camera camcorder tv broadcast digital dslr' },
	{ c: '8528.52', d: 'Monitors capable of connecting to data processing machine', k: 'monitor screen display lcd led computer flatscreen' },
	{ c: '8528.62', d: 'Projectors capable of connecting to data processing machine', k: 'projector video projector beamer data lcd dlp laser' },
	{ c: '8531.20', d: 'Indicator panels with LCD/LED', k: 'led sign display scoreboard indicator panel board digital clock countdown timer' },
	{ c: '8539.52', d: 'Light-emitting diode (LED) light sources', k: 'led bulb light lamp tube strip light source' },
	{ c: '8544.42', d: 'Electric conductors ≤1000V with connectors', k: 'cable wire cord electric power extension lead connector patch cable ethernet data' },
	// Ch.87 Vehicles
	{ c: '8709.19', d: 'Other vehicles for short-distance goods transport', k: 'utility cart golf cart turf vehicle gator mule hauler' },
	{ c: '8716.80', d: 'Other non-mechanically propelled vehicles', k: 'hand truck dolly trolley cart barrow push pull platform' },
	// Ch.94 Furniture
	{ c: '9401.71', d: 'Seats with metal frames, upholstered', k: 'chair metal upholstered stacking banquet conference folding' },
	{ c: '9401.79', d: 'Other seats with metal frames', k: 'chair metal folding stacking event plastic seat stadium bench bleacher' },
	{ c: '9401.80', d: 'Other seats', k: 'chair seat stool bench plastic outdoor garden camping folding director bean bag' },
	{ c: '9403.20', d: 'Other metal furniture', k: 'metal table desk shelf shelving rack stand cabinet locker bench frame' },
	{ c: '9403.60', d: 'Other wooden furniture', k: 'wood table desk shelf cabinet counter podium lectern' },
	{ c: '9403.70', d: 'Furniture of plastics', k: 'plastic table desk chair furniture outdoor stackable modular' },
	{ c: '9403.89', d: 'Other furniture of other materials', k: 'furniture table desk counter bar stage platform riser modular event' },
	{ c: '9405.42', d: 'Other electric lamps and lighting fittings, LED', k: 'led light fixture panel strip flood spot event stage lighting' },
	{ c: '9406.90', d: 'Other prefabricated buildings', k: 'prefab building container modular portable cabin kiosk booth tent structure temporary' },
	// Ch.95 Sports
	{ c: '9503.00', d: 'Toys (tricycles, puzzles, models)', k: 'toy game puzzle model figure plush stuffed mascot doll' },
	{ c: '9505.90', d: 'Other festive/carnival/entertainment articles', k: 'party decoration confetti streamer balloon inflatable costume mascot head festive celebration event' },
	{ c: '9506.62', d: 'Inflatable balls', k: 'ball inflatable football soccer basketball volleyball rugby beach ball' },
	{ c: '9506.99', d: 'Other sports/outdoor games equipment', k: 'sport equipment goal post net whistle cone marker training aid hurdle agility ladder bibs pinnies scoreboard trophy medal podium' },
	// Ch.96 Misc
	{ c: '9608.10', d: 'Ball point pens', k: 'pen ballpoint biro writing instrument' },
	{ c: '9610.00', d: 'Writing/drawing slates and boards', k: 'whiteboard blackboard chalkboard marker board writing surface dry erase flip chart' },
	{ c: '9617.00', d: 'Vacuum flasks and vessels', k: 'thermos flask vacuum bottle insulated container cooler jug' },
];
