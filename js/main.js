let canvas, textbox, gl, shader, batcher, assetManager, skeletonRenderer;
let mvp = new spine.webgl.Matrix4();

let lastFrameTime;
let initialLoadTimer;
let modelFrame;
let renderFrame;
let renderTimer;
let spineData;
let bgSpineData;

let customScale = 1;
let targetFps = 60;
let bgmfile = './assets/audio/Shooting Stars.flac';
let bgmvolume = 0;
let bgm;
let bufferColor = [0.3, 0.3, 0.3];

let introAnimation, acceptingClick;
let dialogBox = false;
let currentVoiceline = 1;
let mouseSelect = -1;
let trackerID = -1;
let untrackerID = -1;
let EPointX, EPointY;
let TPoint, TEye;
let headpatOrigin;
let headpatCooldown = 0;
const headpatTarget = new spine.Vector2();
const headpatOffset = new spine.Vector2();
let flipped = false;

let transpose = 1;

let currentTracks = []; // 跟踪当前播放的音频
window.selectedLanguage = 'Japanese'; // 全局语言变量（挂载到window对象）

const CHARACTER = 'Hoshino';
let modelResolution = '8k';
let loadingResolution;
let modelAtlases;
const HAS_A = { eye: false, point: true };

// All voicelines are manually timed for start point and duration. This may not be the most optimized solution, but works for all intents and purposes.

const AUDIO_DETAIL = [
	{
		time: 4000,
		count: 1,
		startTimes: [500],
		dialog: {
			Japanese: [
				"わぁ……！こんなの初めて…… 目に映る全部がキラキラして、すごい……"
			],
			English: [
				"Wow... Amazing. I've never been to a place like this before."
			],
			Chinese: [
				"诶~好厉害。第一次来这种地方。"
			]
		}
	},
	{
		time: 7000,
		count: 1,
		startTimes: [500],
		dialog: {
			Japanese: [
				"あれ見て！お魚だ！あははは、カワイイ！"
			],
			English: [
				"Look! It's a fish! Hahaha. It's so cute!"
			],
			Chinese: [
				"看那里！是鱼耶！啊哈哈哈，好可爱！"
			]
		}
	},
	{
		time: 14000,
		count: 3,
		startTimes: [500, 6600, 12000],
		dialog: {
			Japanese: [
				"私一人こんなに楽しんでていいのかな…。",
				"余計な心配だって？",
				"…そうかな？"
			],
			English: [
				"Is it okay that I'm the only one who's having so much fun...?",
				"I shouldn't worry about that?",
				"All right, then."
			],
			Chinese: [
				"我一个人这么开心真的好吗…。",
				"你说这是多余的担心？",
				"…是吗？"
			]
		}
	}
];


const HITBOX = {
	headpat: { xMin: 1200, xMax: 1800, yMin: 150, yMax: 570 },
	voiceline: { xMin: 1250, xMax: 1810, yMin: 890, yMax: 1800 }
};

const INTRO_TIMEOUT = 19500;
const HEADPAT_CLAMP = 30;
const HEADPAT_DRAG_SCALE = 0.35;
const HEADPAT_FOLLOW_TIME = 0.055;
const HEADPAT_RETURN_TIME = 0.08;
const EYE_CLAMP_X = 200;
const EYE_CLAMP_Y = EYE_CLAMP_X * (9 / 16);
const EYE_STEP = 10;

let mousePos = { x: 0, y: 0 };
let volume = 0.5;
let mouseOptions = { voicelines: true, headpatting: true, mousetracking: true, drawHitboxes: false };

// Helper clamp function. Math does not appear to have clamp() in this version.
function clamp(num, min, max) {
	return Math.min(Math.max(num, min), max);
}

// NOTE: X and Y appears to be inversely related from cursor position to bone adjustment.
//       This behavior's reason is unknown, but it LOOKS right so leave it alone!
function trackMouse() {
	let adjX = (mousePos.x / canvas.width) - 0.5;
	let adjY = (mousePos.y / canvas.height) - 0.5;
	TEye.y = TEye.y - (Math.sign(adjX) * EYE_STEP);
	TEye.x = TEye.x - (Math.sign(adjY) * EYE_STEP);
	TEye.y = clamp(TEye.y, EPointY - (Math.abs(adjX) * EYE_CLAMP_X), EPointY + (Math.abs(adjX) * EYE_CLAMP_X));
	TEye.x = clamp(TEye.x, EPointX - (Math.abs(adjY) * EYE_CLAMP_Y), EPointX + (Math.abs(adjY) * EYE_CLAMP_Y));
}

function untrackMouse() {
	if (Math.abs(TEye.y - EPointY) <= EYE_STEP && Math.abs(TEye.x - EPointX) <= EYE_STEP) {
		if (untrackerID != -1) {
			TEye.y = EPointY;
			TEye.x = EPointX;
			clearInterval(untrackerID);
			untrackerID = -1;
			setTimeout(function () {
				acceptingClick = true;
			}, 500);
		}
	}
	if (TEye.y > EPointY) TEye.y -= EYE_STEP;
	if (TEye.y < EPointY) TEye.y += EYE_STEP;
	if (TEye.x > EPointX) TEye.x -= EYE_STEP;
	if (TEye.x < EPointX) TEye.x += EYE_STEP;
}

function applyHeadpat(delta) {
	const dx = headpatTarget.x - headpatOffset.x;
	const dy = headpatTarget.y - headpatOffset.y;
	if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
		headpatOffset.set(headpatTarget.x, headpatTarget.y);
	} else {
		const blend = 1 - Math.exp(-delta / (headpatOrigin ? HEADPAT_FOLLOW_TIME : HEADPAT_RETURN_TIME));
		headpatOffset.x += dx * blend;
		headpatOffset.y += dy * blend;
	}
	TPoint.x += headpatOffset.x;
	TPoint.y += headpatOffset.y;
}

function releaseHeadpatOnExit() {
	if (headpatOrigin && spineData) releasedMouse();
}

function playVoiceline() {
	spineData.state.setEmptyAnimation(1, 1);
	spineData.state.setEmptyAnimation(2, 1);
	spineData.state.addAnimation(1, `Talk_0${currentVoiceline}_M`, false, 0);
	spineData.state.addAnimation(2, `Talk_0${currentVoiceline}_A`, false, 0);
	spineData.state.addEmptyAnimation(1, 0.5, 0);
	spineData.state.addEmptyAnimation(2, 0.5, 0);

	let trackDetails = AUDIO_DETAIL[currentVoiceline - 1];

	setTimeout(function () {
		acceptingClick = true;
		// 当达到末尾时循环回到第一句
		if (currentVoiceline >= AUDIO_DETAIL.length) {
			currentVoiceline = 1;
		} else {
			currentVoiceline = currentVoiceline + 1;
		}
	}, trackDetails.time);

	for (let i = 0; i < trackDetails.count; i++) {
		let track;
		if (trackDetails.count == 1) track = new Audio(`./assets/audio/${CHARACTER}_memoriallobby_${currentVoiceline}.ogg`);
		else track = new Audio(`./assets/audio/${CHARACTER}_memoriallobby_${currentVoiceline}_${(i + 1)}.ogg`);
		track.volume = volume;
		setTimeout(function () {
			track.play();
			currentTracks.push({ track, index: i }); // 记录当前播放的音频
			if (dialogBox) {
				const selectedLanguage = window.selectedLanguage || 'Japanese'; // 使用全局语言变量
				textbox.innerHTML = trackDetails.dialog[selectedLanguage][i];
				if (dialogBox) textbox.style.opacity = 1; // 确保仅当显示对话框时生效
				track.addEventListener('ended', function () {
					currentTracks = currentTracks.filter(t => t.track !== track); // 移除结束的音频
					textbox.style.opacity = 0;
				});
			}
		}, trackDetails.startTimes[i])
	}
}

// Hitbox Scaling
function t(n, side) {
	let d = { x: { length: 2560, mid: (canvas.width / 2) }, y: { length: 1600, mid: (canvas.height / 2) } }
	n = d[side].mid - n;
	n = (d[side].length / (transpose * 2)) - n;
	n = (n - (d[side].length / (transpose * 2))) / customScale;
	return (n + (d[side].length / (transpose * 2))) * transpose;
}

// -1 = [No Entry], 1 = Headpat, 2 = Voiceline, 3 = Eye Track
function pressedMouse(x, y) {
	tx = t(x, 'x');
	ty = t(y, 'y');
	if (tx > HITBOX.headpat.xMin && tx < HITBOX.headpat.xMax && ty > HITBOX.headpat.yMin && ty < HITBOX.headpat.yMax && mouseOptions.headpatting) {
		spineData.state.setAnimation(1, 'Pat_01_M', false);
		if (HAS_A.point) spineData.state.setAnimation(2, 'Pat_01_A', false);
		headpatOrigin = { x, y };
		mouseSelect = 1;
	}
	else if (tx > HITBOX.voiceline.xMin && tx < HITBOX.voiceline.xMax && ty > HITBOX.voiceline.yMin && ty < HITBOX.voiceline.yMax && mouseOptions.voicelines) {
		mouseSelect = 2;
	}
	else if (mouseOptions.mousetracking) {
		if (trackerID == -1) {
			trackerID = setInterval(trackMouse, 20);
		}
		spineData.state.setEmptyAnimation(1, 0);
		spineData.state.setEmptyAnimation(2, 0);
		let eyetracking = spineData.state.addAnimation(1, 'Look_01_M', false, 0);
		eyetracking.mixDuration = 0.2;
		if (HAS_A.eye) {
			let eyetracking2 = spineData.state.addAnimation(2, 'Look_01_A', false, 0);
			eyetracking2.mixDuration = 0.2;
		}
		mousePos.x = x;
		mousePos.y = y;
		mouseSelect = 3;
	}
	else if (mouseSelect == -1) {
		acceptingClick = true;
	}
}

function drawHitboxes() {
	if (!overlay || !overlay.getContext) return;
	const ctx = overlay.getContext('2d');
	if (!ctx) return;

	ctx.clearRect(0, 0, overlay.width, overlay.height);
	if (!mouseOptions.drawHitboxes) return;

	
	ctx.save();
	ctx.lineWidth = 2;
	ctx.strokeStyle = 'red';
	ctx.globalAlpha = 0.5;

	function worldToScreen(n, side) {
		let d = { x: { length: 2560, mid: (canvas.width / 2) }, y: { length: 1600, mid: (canvas.height / 2) } };
		n = (n / transpose) - (d[side].length / (transpose * 2));
		n = n * customScale + (d[side].length / (transpose * 2));
		n = (d[side].length / (transpose * 2)) - n;
		return d[side].mid - n;
	}

	for (const key in HITBOX) {
		const box = HITBOX[key];
		const x1 = worldToScreen(box.xMin, 'x');
		const y1 = worldToScreen(box.yMin, 'y');
		const x2 = worldToScreen(box.xMax, 'x');
		const y2 = worldToScreen(box.yMax, 'y');
		const width = x2 - x1;
		const height = y1 - y2;
		ctx.strokeRect(x1, y2, width, height);
	}

	ctx.restore();
}

function movedMouse(x, y) {
	switch (mouseSelect) {
		case 1: {
			const scale = HEADPAT_DRAG_SCALE * transpose / customScale;
			const parent = TPoint.parent;
			headpatTarget.set(
				parent.worldX + (x - headpatOrigin.x) * scale,
				parent.worldY + (headpatOrigin.y - y) * scale
			);
			parent.worldToLocal(headpatTarget);
			const distance = headpatTarget.length();
			if (distance > HEADPAT_CLAMP) {
				headpatTarget.x *= HEADPAT_CLAMP / distance;
				headpatTarget.y *= HEADPAT_CLAMP / distance;
			}
			break;
		}
		case 2:
			mouseSelect = -1;
			acceptingClick = true;
			break;
		case 3:
			mousePos.x = x;
			mousePos.y = y;
			break;
		default:
	}
}

function releasedMouse() {
	switch (mouseSelect) {
		case 1: {
			headpatOrigin = null;
			headpatTarget.set(0, 0);
			const state = spineData.state;
			const motion = state.setAnimation(1, 'PatEnd_01_M', false);
			const expression = state.setAnimation(2, 'PatEnd_01_A', false);
			state.addEmptyAnimation(1, 0.5, motion.animationEnd);
			state.addEmptyAnimation(2, 0.5, expression.animationEnd);
			headpatCooldown = setTimeout(() => {
				headpatCooldown = 0;
				acceptingClick = true;
			}, 500);
			break;
		}
		case 2:
			playVoiceline();
			break;
		case 3:
			if (trackerID != -1) {
				clearInterval(trackerID);
				trackerID = -1;
			}
			if (untrackerID == -1) {
				untrackerID = setInterval(untrackMouse, 20);
			}
			let eyetracking = spineData.state.setAnimation(1, 'LookEnd_01_M', false);
			let eyetracking2 = spineData.state.setAnimation(2, 'LookEnd_01_A', false);
			eyetracking.mixDuration = 0;
			eyetracking2.mixDuration = 0;
			spineData.state.addEmptyAnimation(1, 0.5, 0);
			spineData.state.addEmptyAnimation(2, 0.5, 0);
			break;
		default:
	}
	mouseSelect = -1;
}

// adjusts mouse values for flipped canvas
function setMouse(event) {
	let ax = event.clientX;
	let ay = event.clientY;
	if (flipped) {
		ax = canvas.width - ax;
	}

	return { x: ax, y: ay }
}

function init() {
	// Wallpaper Engine settings
	window.wallpaperPropertyListener = {
		applyUserProperties: (props) => {
			if (props.schemecolor) {
				bufferColor = props.schemecolor.value.split(" ");
			}
			if (props.alignmentfliph) flipped = props.alignmentfliph.value;
			if (props.scale) {
				customScale = props.scale.value;
				document.documentElement.style.setProperty('--wallpaper-scale', customScale);
				resize();
			}
			if (props.targetfps) targetFps = props.targetfps.value;

			if (props.introanimation) introAnimation = props.introanimation.value;
			if (props.modelresolution) {
				const selected = props.modelresolution.value;
				if (['2k', '4k', '8k'].includes(selected)) modelResolution = selected;
			}
			requestModelResolution();

			if (props.mousetracking) mouseOptions.mousetracking = props.mousetracking.value;
			if (props.headpatting) mouseOptions.headpatting = props.headpatting.value;
			if (props.voicelines) mouseOptions.voicelines = props.voicelines.value;
			if (props.voicevolume) volume = props.voicevolume.value / 100;
			if (props.showdialog) dialogBox = props.showdialog.value;
			if (props.dialogx) textbox.style.left = props.dialogx.value + '%';
			if (props.dialogy) textbox.style.top = props.dialogy.value + '%';
			if (props.drawHitboxes) mouseOptions.drawHitboxes = props.drawHitboxes.value;

			// 新增：监听语言选择
			if (props.dialoglanguage) {
				window.selectedLanguage = props.dialoglanguage.value; // 更新全局语言变量
				// 触发语言变更事件
				const languageChangeEvent = new Event('languageChange');
				window.dispatchEvent(languageChangeEvent);
				// 更新当前播放的音频文本
				currentTracks.forEach(({ track, index }) => {
					const trackDetails = AUDIO_DETAIL[currentVoiceline - 1];
					if (dialogBox && trackDetails.dialog[window.selectedLanguage]) {
						textbox.innerHTML = trackDetails.dialog[window.selectedLanguage][index];
					}
				});
				// 更新intro语音文本
				if (introAudioIsPlaying && introAudioDetail && dialogBox) {
					const currentIndex = introAudioDetail.startTimes.findIndex(time => Date.now() >= time);
					if (currentIndex >= 0 && introAudioDetail.dialog[window.selectedLanguage]) {
						textbox.innerHTML = introAudioDetail.dialog[window.selectedLanguage][currentIndex];
					}
				}
			}

			// 添加introDialog属性处理
			if (props.introDialogX) introDialogX = props.introDialogX.value;
			if (props.introDialogY) introDialogY = props.introDialogY.value;

			// 如果当前正在显示intro对话框，实时更新位置
			if (introAnimation && textbox.style.opacity === '1' &&
				introAudioIsPlaying && dialogBox) {
				textbox.style.left = introDialogX + '%';
				textbox.style.top = introDialogY + '%';
			}

			if (props.bgmfile) {
				bgmfile = 'file:///' + props.bgmfile.value.replace("%3A", "\:");
			}
			if (props.bgmvolume) {
				bgmvolume = props.bgmvolume.value / 100;
				if (bgm) bgm.volume = bgmvolume;
			}
		},
		setPaused: function (isPaused) {
			if (bgm) {
				if (isPaused) {
					setTimeout(() => { bgm.volume = 0; }, 200);
				} else {
					setTimeout(() => { bgm.volume = bgmvolume; }, 200);
				}
			}
		}
	};

	textbox = document.getElementById('textbox');

	canvas = document.getElementById('canvas');
	canvas.addEventListener('mouseleave', releaseHeadpatOnExit);
	window.addEventListener('blur', releaseHeadpatOnExit);
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	overlay = document.getElementById('overlay');
	overlay.width = window.innerWidth;
	overlay.height = window.innerHeight;

	let config = { alpha: false, premultipliedAlpha: false };
	gl = canvas.getContext('webgl', config) || canvas.getContext('experimental-webgl', config);
	if (!gl) {
		alert('WebGL is unavailable.');
		return;
	}

	// Create a simple shader, mesh, model-view-projection matrix, SkeletonRenderer, and AssetManager.
	shader = spine.webgl.Shader.newTwoColoredTextured(gl);
	batcher = new spine.webgl.PolygonBatcher(gl);
	mvp.ortho2d(0, 0, canvas.width - 1, canvas.height - 1);
	skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);
	assetManager = new spine.webgl.AssetManager(gl);


	initialLoadTimer = setTimeout(() => {
		if (typeof introAnimation === 'undefined') introAnimation = true;
		requestModelResolution();
	}, 350);
	window.addEventListener('pagehide', event => {
		if (event.persisted) return;
		canvas.style.visibility = 'hidden';
		clearTimeout(initialLoadTimer);
		cancelAnimationFrame(modelFrame);
		cancelAnimationFrame(renderFrame);
		clearTimeout(renderTimer);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	});
}

// CITATION: http://esotericsoftware.com/spine-api-reference#
// CITATION: http://en.esotericsoftware.com/forum/Spine-Unity-Making-the-arm-follow-the-mouse-7856
function interactionLoad() {
	// Touch_Point and Touch_Eye
	TPoint = spineData.skeleton.findBone('Touch_Point');
	TEye = spineData.skeleton.findBone('Touch_Eye');
	EPointX = TEye.x;
	EPointY = TEye.y;

	downaction = canvas.addEventListener('mousedown', function (event) {
		if (!acceptingClick) {
			return;
		}
		acceptingClick = false;
		let mouseData = setMouse(event);
		pressedMouse(mouseData.x, mouseData.y);
	});
	upaction = canvas.addEventListener('mouseup', function () {
		releasedMouse();
	});
	moveaction = canvas.addEventListener('mousemove', function (event) {
		let mouseData = setMouse(event);
		movedMouse(mouseData.x, mouseData.y);
	});

	if (!introAnimation) {
		acceptingClick = true;
	}
	else {
		setTimeout(function () {
			acceptingClick = true;
		}, INTRO_TIMEOUT);
	}

	return 1;
}

let introAudioIsPlaying = false;

function requestModelResolution() {
	if (!assetManager || modelFrame || typeof introAnimation === 'undefined' || loadingResolution === modelResolution) return;
	loadingResolution = modelResolution;
	const directory = loadingResolution === '8k' ? 'assets/' : 'assets/' + loadingResolution + '/';
	const models = [CHARACTER + '_home', CHARACTER + '_home_background'];
	const binaryPaths = models.map(name => new URL(directory + name + '.skel', document.baseURI).href);
	const atlasPaths = models.map(name => new URL(directory + name + '.atlas', document.baseURI).href);

	canvas.style.visibility = 'hidden';
	cancelAnimationFrame(renderFrame);
	clearTimeout(renderTimer);
	assetManager.removeAll();
	if (!spineData) binaryPaths.forEach(file => assetManager.loadBinary(file));
	atlasPaths.forEach(file => assetManager.loadTextureAtlas(file));

	function waitForTextures() {
		if (!assetManager.isLoadingComplete()) {
			modelFrame = requestAnimationFrame(waitForTextures);
			return;
		}
		modelFrame = 0;
		if (loadingResolution !== modelResolution) {
			requestModelResolution();
			return;
		}
		const atlases = atlasPaths.map(file => assetManager.get(file));
		if (atlases.some(atlas => !atlas) || (!spineData && binaryPaths.some(file => !assetManager.get(file)))) {
			console.error('Spine model assets are unavailable for resolution: ' + loadingResolution);
			loadingResolution = undefined;
			return;
		}
		if (!spineData) {
			modelAtlases = atlases;
			load(binaryPaths, atlasPaths);
			return;
		}

		// Both resolutions use the same atlas layout and skeleton. Retain the active animation.
		modelAtlases.forEach((atlas, i) => {
			atlas.pages.forEach((page, j) => {
				page.texture = atlases[i].pages[j].texture;
			});
			for (const region of atlas.regions) region.texture = region.page.texture;
		});
		lastFrameTime = Date.now() / 1000;
		render();
		canvas.style.visibility = 'visible';
	}
	modelFrame = requestAnimationFrame(waitForTextures);
}

function load(binaryPaths, atlasPaths) {
        spineData = loadSpineData(binaryPaths[0], atlasPaths[0], false);
        bgSpineData = loadSpineData(binaryPaths[1], atlasPaths[1], false);

        // User Option to skip Intro Animation
        if (introAnimation) {
            spineData.state.addAnimation(0, 'Start_Idle_01', false);

            if (mouseOptions.voicelines) {
                // 保存当前从project.json获取的文本框位置
                const originalPosition = {
                    left: textbox.style.left,
                    top: textbox.style.top
                };

                const introAudioDetail = {
                    count: 1,
                    startTimes: [3500],
                    dialog: {
                        Japanese: [
                            "あれが鯨ってやつなの？"
                        ],
                        English: [
                            "Is that a whale?"
                        ],
                        Chinese: [
                            "那个，是鲸鱼吗？"
                        ]
                    },
                    dialogPosition: {
                        x: introDialogX,
                        y: introDialogY
                    }
                };

                for (let i = 0; i < introAudioDetail.count; i++) {
                    let track = new Audio(`./assets/audio/${CHARACTER}_memoriallobby_0_${(i + 1)}.ogg`);
                    track.volume = volume;

                    setTimeout(function () {
                        if (dialogBox) {
                            introAudioIsPlaying = true;
                            textbox.style.left = introDialogX + '%';
                            textbox.style.top = introDialogY + '%';
                        }
                    }, introAudioDetail.startTimes[i] - 1000);

                    setTimeout(function () {
                        track.play();
                        if (dialogBox) {
                            const selectedLanguage = window.selectedLanguage || 'Japanese';
                            textbox.innerHTML = introAudioDetail.dialog[selectedLanguage][i];
                            textbox.style.opacity = 1;

                            // 添加语言切换监听
                            const updateText = () => {
                                const currentLanguage = window.selectedLanguage || 'Japanese';
                                textbox.innerHTML = introAudioDetail.dialog[currentLanguage][i];
                            };
                            window.addEventListener('languageChange', updateText);

                            track.addEventListener('ended', function () {
                                textbox.style.opacity = 0;
                                window.removeEventListener('languageChange', updateText);

                                if (i === introAudioDetail.count - 1) {
                                    setTimeout(function () {
                                        introAudioIsPlaying = false;
                                        textbox.style.left = originalPosition.left;
                                        textbox.style.top = originalPosition.top;
                                    }, 1000);
                                }
                            });
                        }
                    }, introAudioDetail.startTimes[i]);
                }
            }
        }

	spineData.state.addAnimation(0, 'Idle_01', true, 0);
	bgSpineData.state.addAnimation(0, 'Dev_Test', true, 0);

	interactionLoad();
	resize();

	// Plays user-defined BGM (if set)
	bgm = new Audio(bgmfile);
	bgm.volume = bgmvolume;
	bgm.loop = true;
	bgm.play();
	bgm.addEventListener('ended', function () {
		this.currentTime = 0;
		this.play();
	}, false);

	lastFrameTime = Date.now() / 1000;
	// Call render every frame.
	render();
	canvas.style.visibility = 'visible';
}

function loadSpineData(binaryPath, atlasPath, premultipliedAlpha) {
	// Load the texture atlas from the AssetManager.
	let atlas = assetManager.get(atlasPath);

	// Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
	let atlasLoader = new spine.AtlasAttachmentLoader(atlas);

	// Create a SkeletonBinary instance for parsing the .skel file.
	let skeletonBinary = new spine.SkeletonBinary(atlasLoader);

	// Set the scale to apply during parsing, parse the file, and create a new skeleton.
	skeletonBinary.scale = 1;
	let skeletonData = skeletonBinary.readSkeletonData(assetManager.get(binaryPath));
	let skeleton = new spine.Skeleton(skeletonData);
	let bounds = calculateSetupPoseBounds(skeleton);

	// Create an AnimationState, and set the initial animation in looping mode.
	let animationStateData = new spine.AnimationStateData(skeleton.data);
	animationStateData.defaultMix = 0.5;
	let animationState = new spine.AnimationState(animationStateData);

	// Pack everything up and return to caller.
	return { skeleton: skeleton, state: animationState, bounds: bounds, premultipliedAlpha: premultipliedAlpha };
}

function calculateSetupPoseBounds(skeleton) {
	skeleton.setToSetupPose();
	skeleton.updateWorldTransform();
	let offset = new spine.Vector2();
	let size = new spine.Vector2();
	skeleton.getBounds(offset, size, []);
	return { offset: offset, size: size };
}

function render() {
	let now = Date.now() / 1000;
	let delta = now - lastFrameTime;

	lastFrameTime = now;

	gl.clearColor(bufferColor[0], bufferColor[1], bufferColor[2], 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Apply the animation state based on the delta time.
	shader.bind();
	shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
	shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);

	if(bgSpineData) {
		let bgSkeleton = bgSpineData.skeleton;
		let bgState = bgSpineData.state;
		bgState.update(delta);
		bgState.apply(bgSkeleton);
		bgSkeleton.updateWorldTransform();
		
		batcher.begin(shader);
		skeletonRenderer.draw(batcher, bgSkeleton);
		batcher.end();
	}

	let skeleton = spineData.skeleton;
	let state = spineData.state;
	let premultipliedAlpha = spineData.premultipliedAlpha;
	state.update(delta);
	state.apply(skeleton);
	const pointX = TPoint.x;
	const pointY = TPoint.y;
	applyHeadpat(delta);
	skeleton.updateWorldTransform();
	TPoint.x = pointX;
	TPoint.y = pointY;

	batcher.begin(shader);
	skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
	skeletonRenderer.draw(batcher, skeleton);
	batcher.end();

	shader.unbind();

	// throttle fps
	let elapsed = Date.now() / 1000 - now;
	let targetFrameTime = 1 / targetFps;
	let delay = Math.max(targetFrameTime - elapsed, 0) * 1000;

	drawHitboxes();

	renderTimer = setTimeout(() => {
		renderFrame = requestAnimationFrame(render);
	}, delay);
}

function resize() {
	let w = canvas.clientWidth;
	let h = canvas.clientHeight;
	if (canvas.width != w || canvas.height != h) {
		canvas.width = w;
		canvas.height = h;
	}

	// Set values to position skeleton to center of canvas.
	// Will always attempt to Fit to Fill while maintaining aspect ratio. As a result, a scale of [1] will mean different things across various device resolutions.
	let centerX = 0;
	let centerY = 900;
	let wr = canvas.width / 2560;
	let hr = canvas.height / 1600;
	let width = (2560 / customScale);
	let height = (1600 / customScale);

	if (wr < hr) {
		width = height * (canvas.width / canvas.height);

		transpose = 1600 / canvas.height;
	}
	else if (wr > hr) {
		height = width * (canvas.height / canvas.width);

		transpose = 2560 / canvas.width;
	}
	else {
		transpose = 1600 / canvas.height;
	}

	mvp.ortho2d(centerX - width / 2, centerY - height / 2, width, height);
	gl.viewport(0, 0, canvas.width, canvas.height);
}

init();
