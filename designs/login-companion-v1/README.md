# 登录墨团交互分镜 · 第一版

八格设计审稿图：`storyboard.png`。使用内置 imagegen，根据既有登录页截图中的捧书墨团生成。仅为视觉方向参考，不是最终 SVG 资产或可播放动画。

审查重点：角色辨识度；低头读书与举书挡脸的区别；举书时面部完全遮挡；隐藏密码时眼睛重新露出；错误状态温和、成功状态简短。

后续交互样稿应以原始 SVG 轮廓为基准，分别控制头、表情、手、书、书签；这张概念图中的局部形状差异不应逐帧照搬。显示密码状态优先于鼠标跟随和普通输入状态。成功导航不等待装饰动画。

## 已接入正式页面

2026-10-18：`frontend/src/components/LoginCompanion.jsx` 使用原始线稿分层实现，登录页增加密码显隐按钮、光标与选区保留、凭证错误关联、等待与防重复提交。角色只接收姿势状态，不接收用户名或密码内容。后续确认采用“翻回这一页”，成功后的独立挥手已替换为挑书与页面翻动，见 `../login-page-turn-v1/README.md`。

验证：`npm run check`（ESLint、160 项 Node 测试、构建、包体预算）通过；5 项新增登录浏览器回归及 1 项原有公开页面回归通过。覆盖鼠标、键盘、连续显隐、输入选区、等待与错误恢复、真实登录与 next 跳转、320/390/768/1440px、深浅主题、触控仿真和减少动态。未作手机真机或读屏实测。

## 生成提示词

Create a polished storyboard DESIGN REVIEW BOARD for the Ying Mo login interaction, ONE wide landscape image with exactly eight equal panels in a 4-column x 2-row grid, high resolution. Use the provided screenshot as the reference for visual identity and especially the EXISTING BLACK INK CHARACTER READING A BOOK at lower left. Do not reproduce the webpage. Extract its character identity into eight expressive consistent poses.

Art direction: warm paper #f8f7f3, near-black #242520, very restrained indigo #334b76. Elegant Chinese editorial typography, airy generous whitespace, fine straight dividers between panels, no rounded cards, no gradients or 3D. Crisp sparse hand-drawn vector-like outlines. The mascot is the reference's irregular pear-shaped ink blob, WITHOUT ears, hair, nose, clothing, white eyeballs, or extra limbs. Two tiny cream eye marks and a tiny cream mouth. Thin outline hands/legs. Seated in the same gently crooked line chair, an open paper book with indigo bookmark, tiny tea cup on a side table to its left. Preserve EXACT SAME character silhouette, scale, chair, book design, props, and line weight across all eight panels. Chair, cup and baseline remain fixed. Only head, face, book and arms move. Character must be large enough to inspect expressions in each panel, roughly 2/3 panel width. NO panels with duplicate poses: show state differences clearly but subtly.

Header at top: "映墨 · 登录小剧场". Small subtitle: "八个瞬间，一位看书的朋友". Small top-right annotation: "交互分镜 / 01". All Chinese text accurate and neatly typeset, no paragraphs. Each panel gets a small blue number, clear black Chinese state label at top, and one short gray caption under illustration.

Reading order left to right, top then bottom:
01 title "刚进页面", caption "听见你来，抬头看一眼": mascot holds open book in lap and gently lifts face toward viewer, relaxed little smile. A tiny indigo greeting mark near head.
02 title "移动鼠标", caption "眼睛跟随，轻轻偏头": same mascot leans head a few degrees toward upper right; small cream eye marks visibly look upper right. Small outlined cursor in empty upper-right area with a restrained fine indigo dotted gaze arc. No big eyes.
03 title "输入用户名", caption "从书沿探头，看向表单": mascot sits a little taller, peeks over book edge, face distinctly turned toward right, curious attentive expression. Small subtle rightward indigo gaze tick; no form UI.
04 title "开始输入密码", caption "低下头，认真读自己的书": book resting in lap, head bowed, eye marks lowered toward pages, mouth quiet. Clear reading pose distinct from 01 and 03.
05 title "显示密码", caption "你看密码，我不看": HERO POSE. Lift the ENTIRE OPEN BOOK from lap to eye/head height so the book COMPLETELY OCCLUDES ALL OF THE FACE AND HEAD. No eyes or mouth visible anywhere, absolutely no face drawn on book. Two little outline hands grip outer edges of raised book, seated feet and chair remain visible below, blue bookmark dangles. Book size identical to other panels and wide enough to cover mascot. Two tiny upward action marks.
06 title "隐藏密码", caption "书放下来，眼睛又露出来": open book lowered halfway between raised and lap poses, upper half of head and two eyes re-emerge above top edge, lower face still behind book; hands follow book, tiny downward movement marks. Distinct from panel 05, 01 and 03.
07 title "登录失败", caption "轻轻歪头，再试一次": open book in lap, head tilts gently left, puzzled but kind face, no crying or shame, single small indigo question mark near book upper corner.
08 title "登录成功", caption "点头招呼，欢迎回来": open book rests lower on lap supported by one hand, other thin arm makes a small greeting wave, eyes soft happy arcs, tiny smile, single indigo greeting flourish. No confetti.

Footer small: "设计审稿图 · 动作由分层 SVG 实现". No extra labels or watermark. This board must look like a refined art-directed motion storyboard for the existing minimalist Chinese personal journal brand, not generic kawaii character concept art.
