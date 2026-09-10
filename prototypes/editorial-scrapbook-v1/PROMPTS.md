# 映墨原型生成提示词

历史生成记录：仅用于追溯同目录 PNG 的制作意图，不是实施指令。当前视觉规则见 [DESIGN.md](../../docs/frontend/DESIGN.md)，尤其不得照此强制灰度用户照片或扩大首页装饰。

生成方式：内置 ImageGen。参考图仅用于视觉风格，不复制人物身份。

## 五页共享规范

Use case: ui-mockup. Create a polished, high-fidelity, pixel-sharp desktop webpage prototype for 映墨 · Ying-Mo, an invitation-only Chinese friends' writing and shared-memory space. One complete page per image, flat straight-on screen capture, no browser/device frame or mockup perspective. Target 1536 x 1920 portrait canvas showing a desktop page with 1440px-like desktop proportions. Everything is Chinese-first and elegantly typeset; important text must be exact readable Simplified Chinese.
STYLE SYSTEM for the entire five-page series: Warm almost-white #FCFCFA, near-black #171715, secondary copy #4B4B47, fine warm-grey separators #E9E8E2; understated blue #25265F used ONLY for a few handwritten annotations and doodles (less than 3% colored area). Around 40% whitespace, very rational 12-column editorial grid, page margins 88px. Light refined Chinese Songti/Noto Serif SC 400 for large titles and readable 19-21px body, small clean sans-serif Chinese 15-16px navigation and labels. Large airy typographic hierarchy without bold black blocks. Images are candid monochrome film photography, not illustrations, with subtle texture and straight corners. Collages are restrained overlap 6-18%, rotation under 1.5deg; max two slightly torn edges, never tape/sticker decoration. Fine rectangular outline buttons 0-2px radius where actions require it, text links otherwise. No card walls, no pill chips, no colored backgrounds, no glossy effects or shadows, no gradients.
GLOBAL HEADER, fixed same design across series: 76px high, near-white; left aligned small serif logo “映墨” and small “Ying-Mo”. On right small spaced Chinese navigation “首页   漫游   合集   查找” then hairline vertical separator, “写作   通知 · 2   林间”. Active page gets a subtle near-black underline, not colored pill. The menu “查找” conceptually contains articles, notes, taxonomy and archive; no need to show dropdown. Footer at very bottom, modest: “映墨 · 写字，也和朋友一起记录生活。” left; “关于映墨” right, and tiny legible “原型示例 · 图文为设计占位” caption. Every supplied name, content and count is fictional design sample, not actual member data. Preserve functioning-product affordances, authorship, dates, and visibility. Do not add public sharing, followers, rankings, AI features or unimplemented collaborative editing.
The supplied reference image is VISUAL STYLE AND COMPOSITION REFERENCE ONLY. Do not duplicate the reference person's face/name or its English website copy. Adapt the typography, monochrome intimate scrapbook photography and blue pen annotations to Ying-Mo. Only the webpage, no external design annotations, no screen title outside the UI.

## 首页 / 01-home

PAGE 01 / returning-member homepage. Active header nav 首页. Compose a useful compact editorial scrapbook home with a distinctive but not huge hero.
At y~120 small welcome “晚上好，林间。” and secondary inline link “继续写草稿 →”.
Hero y~190–700: left narrow 4-column editorial group, large delicate serif wordmark “映墨” about 112px, then two lines “写下此刻，” “读到彼此。” in elegant 34px; short 20px supporting “和朋友，把普通日子慢慢存起来。”; two muted text links “往年今日 ↗” and “我的合集 ↗”. Right broad image group with FIVE different monochrome memories arranged like the reference: main photo two distant friends walking by a lakeshore, open notebook beside coffee, view through a moving train window, old street corner, hands turning a book. At most 2 small torn paper edges. Three fine blue pen accents around photos “KEEP THE LITTLE THINGS”, small arrow and tiny star. Do not put large portraits.
Below hero, within first ~860px put quick-note composer directly on background separated with a thin horizontal line, label “此刻，留下一笔”; a single expansive writing line “写点什么，或留下一张照片……” and action row “＋ 图片” “发布范围：仅自己⌄” and small rectangular outlined “发布随记 →”. No filled panel.
At y~980 main heading “朋友的近况” and small right filters “全部   随记   文章”, active 全部 with fine underline. Three clean mixed feed rows separated by rules, date in narrow left gutter, content central, actions on far right. Row 1 date “09 / 07”, author “小雨 · 随记 · 18:30”, sentence “雨停以后，在河边多走了十分钟。” and a small 220x145 monochrome landscape right, link “查看与回应 →”. Row 2 date “09 / 06”, author “阿哲 · 文章”, headline “给缓慢的生活，留一点位置”, excerpt “阅读、散步，和那些暂时没有答案的问题。” plus “4 分钟阅读”. Row 3 date “09 / 05”, author “林间 · 随记”, short sentence “这一次，想把旅途里的小事都记下来。” and muted context “收录于「和朋友去大理」”. Keep feed text highly readable.
Bottom y~1510–1760 a quiet asymmetric two-column closing, left “往年今日” with small date “2025 · 09 · 07” and one genuine-looking monochrome mini print of old desk, small text “那时，我们刚搬进新的生活。” link “重新翻开 →”. Right “正在一起记录” and plain linked title “和朋友去大理” “林间、小雨、阿哲 · 3 人共同记录”. Footer. Create clear whitespace and varying visual weight, not boxes or grid cards.

## 文章列表 / 02-articles

PAGE 02 / article browsing and library. Active header nav 查找. Match the homepage's exact design system but use a COMPACT typographic masthead, not another giant scrapbook hero.
At y~150 breadcrumb “查找 / 文章”; large light serif h1 “写过的，慢慢读。” at ~64px. Supporting “文章、学习笔记与长一点的思考。” Right aligned compact small count “24 篇文章” and text “按发布时间”.
At y~310 thin-rule filter row: tabs “文章   随记   归档”, 文章 active underlined. Below or aligned right show plain controls “全部作者⌄   分类⌄   标签⌄   合集⌄” and small “筛选”. No pills, no many boxed dropdowns.
Feature area y~435–940: left 8 columns, lead latest article with one wide 680x310 black-and-white film photo of a book and mug on a sunny desk, no overlap except one little torn lower edge. Below image small “最近发布 · 林间 · 2026.09.07”, prominent thin serif title “给缓慢的生活，留一点位置”, one clean excerpt “把注意力还给阅读、散步和那些值得被记住的小事。” and “4 分钟阅读    阅读全文 →”. Right 3 columns separated by fine vertical rule, header “接着读”, TWO unboxed entries: “01” small, “一段旅途的另一种记法” “小雨 · 6 分钟”; second “02” “把不确定，写成下一行” “阿哲 · 5 分钟”. Tiny blue handwriting “TAKE YOUR TIME” with short underline at top of sidebar.
Below y~1090 “文章档案” left and “共 24 篇” right. Five spacious horizontal index rows; narrow date column, large readable title, subtitle/tag small and author; far-right simple →. Text rows: “09 / 03” “雨天，适合读一本旧书” “随笔 · 小雨”; “08 / 28” “学习如何把问题问得更好” “学习 · 林间”; “08 / 21” “做一个会被自己使用的小工具” “技术 · 阿哲”; “08 / 16” “旅途中，那些没有拍下来的风景” “旅行 · 小雨”; “08 / 09” “夏天结束前的一封信” “随笔 · 林间”. Distinguish dates from titles, enough line height.
Small pagination “上一页   01   02   下一页 →” before footer. Lots of whitespace, practical scanning, no fake metrics or thumbnails per row.

## 文章阅读 / 03-reading

PAGE 03 / long-form article detail. Active header nav 查找. Match the exact five-page style. Design for sustained reading: restrained masthead and legible body, NOT a huge collage or a huge cover before the text.
Top y~145 small link “← 返回文章”. Header starts y~210; small “随笔 / 2026.09.07”. Elegant 60px thin Chinese serif title across two lines: “给缓慢的生活，” then “留一点位置”. Width about 760px central-right. Under it 22px deck “关于阅读、散步，和那些暂时没有答案的问题。” Metadata row “林间    4 分钟阅读    所有登录成员可见” in 15px sans. Thin line below.
Content grid y~530 onwards: left narrow 230px quiet sticky contents with heading “这一篇”, three lines “01 留出一点时间”, “02 看见日常的纹理”, “03 慢慢继续”; fine handwritten small blue “SLOW READING” and one underline near bottom of this margin. Main article reading column 740px wide with 22px serif body (make it actually readable) and generous 1.75 line-height. Right ~100px deliberately empty margin, subtle small “01 / 03” progress mark.
First h2 “留出一点时间”. Body exact 2 short paragraphs:
“我们总在等一个更合适的时刻。等事情少一点，等生活安静下来，再去写那篇想了很久的文章。”
“后来发现，日子并不会自动空出来。能做的，是为在意的事留下一小段时间。”
Then an inline wide monochrome photograph of window light on an open notebook and coffee, about 740x300. Simple small caption “周日下午，书桌旁的一小片光。摄于 2026 年 9 月。”
Then h2 “看见日常的纹理”. Body “阅读、散步和记录，让普通的一天重新变得具体。那些被写下的小事，也成了以后回来的路。”
Then one short pull quote in light 29px serif with a thin short blue hand underline, not panel: “慢一点，也是在向前。”
After a thin line, slim interaction row use only monochrome small outline symbols with text “♡ 12   回应 3   收藏” and optional simple “更多回应⌄” preserves fixed reactions through menu; no colored emoji buttons scattered. Then “留下回应” heading and minimalist 2-line comment input with placeholder “读到这里，你想起了什么？” plus small outlined “发表评论”. Below one short sample comment “小雨 · 今天” “读完以后，也想去走走了。” and “回复”. Bottom next article link “接着读 → 一段旅途的另一种记法”. Fit everything elegantly in one full-page canvas ending with footer. Do not let tiny lorem ipsum fill body.

## 合集详情 / 04-collection

PAGE 04 / collection detail, a shared memory volume with timeline. Active header nav 合集. Page supports ONLY current features: collection creator/member readership and contribution, timeline, image gallery, member list and collection management. No book-export button or memory-relay feature, as those are not implemented.
Top y~135 breadcrumb “合集 / 共同记录”. Hero y~210–720 asymmetric: left 4 columns, small “COLLECTION / 旅行”, large light 65px title broken two lines “和朋友” “去大理”. Small readable 20px introduction “把一起走过的路，收进同一本记忆里。” Metadata “2026.08.16 — 08.20” as this sample journey's visible post date span. Shared authors list “林间 · 创建者” and “小雨、阿哲 · 共同成员”. Clear 15px audience text “仅合集成员可见”. Two restrained actions: thin rectangular outlined “写入新的记录 →” and text “管理合集”. Right 7 columns a compact 4-photo black-and-white collage: main candid two or three distant friends sitting by Erhai lakeshore, train window, street café cups, a small mountain view. Slight uneven photo edges max two, min rotation, one blue note “WE WERE HERE” with arrow, tiny star. No main personal portrait.
Below y~805 full-width slim tabs “共同时间轴    合集内容    共同影像” active first underlined. Right plain “全部作者⌄   全部类型⌄”. Thin rule.
Timeline body y~960–1640, left 180px date gutter “2026” large restrained serif and “八月”, vertical fine grey rule. Center content width 780. Right 240px secondary index beyond thin vertical rule titled “共同署名”; vertically “林间 / 创建者”, “小雨 / 共同成员”, “阿哲 / 共同成员”; bottom “合集通知” “仅重要⌄”, note “成员变更仍会通知你。”
THREE timeline entries, each with clear author/date, content and optional photo:
“08.20” “林间 · 文章” title “回来以后，还在想那片海” excerpt “有些风景，离开之后才开始被记住。” link “阅读全文 →”
“08.18” “小雨 · 随记” “我们在湖边坐了一个下午，什么也没做。” wide compact monochrome print of friends' feet facing the lake plus small “Live Photo ▷” subtle label; caption “洱海 · 阴天”.
“08.16” “阿哲 · 随记” “第一天，从一杯路边咖啡开始。” small café thumbnail to right.
Footer before bottom whitespace; final quiet sentence “每一篇，仍然保留真实的署名。” Exact Chinese, sparse structural rules, no rounded cards, no public share action.

## 写作页 / 05-editor

PAGE 05 / writing editor with visible publication sidebar. Active header nav 写作. This is a usable quiet writing desk using the SAME editorial design system, not a display hero. One desktop screen with some lower content; warm white, crisp thin rules, minimal chrome.
Top header shared with other pages. At y~140 breadcrumb left “← 我的文稿”; small status centered “草稿 · 已保存 23:08”; right text tabs “编辑   预览” with 编辑 active and a rectangular outlined “发布文章 →” button. Under this a fine horizontal separator.
Two-column workspace from y~235: main writing area x~180–1040 about 820px wide, sidebar x~1140–1450 about 300px wide separated by very pale vertical rule. Main top small toggle “文章   随记” active 文章. Huge input-like but borderless 56px Chinese serif title “给缓慢的生活，留一点位置” broken into two natural lines if needed. Below slim muted “摘要 · 可选” then 20px actual entered text “关于阅读、散步，和那些暂时没有答案的问题。” Fine separator.
Slim practical toolbar at y~490 with text “图片   H2   B   I   引用   列表   链接   代码   公式” in small clean sans with adequate spacing; far right “Markdown 源码” option. No rounded tool pills.
Body editable region in 21px serif and large spacing. Heading “留出一点时间”; two paragraphs:
“我们总在等一个更合适的时刻。等事情少一点，等生活安静下来，再去写那篇想了很久的文章。”
“后来发现，日子并不会自动空出来。能做的，是为在意的事留下一小段时间。”
Then one selected inline image block (thin warm-grey outline only, not card), black-and-white photograph of an open notebook on a windowsill, 730x300. Hover-style short floating micro toolbar top edge “上移   下移   替换   移除” legible. Under image a caption editing line “周日下午，书桌旁的一小片光。” and small text “图注” label. Below next heading “看见日常的纹理” and one short paragraph “把日常写下来，给以后的自己留一条回来的路。” with a discreet caret at the end.
Bottom writing-area thin rule and small “约 360 字   自动保存已开启” plus “＋ 添加图片或 Live Photo” and a tiny blue handwritten “ONE LINE AT A TIME” in margin.
Sidebar titled “文稿信息” 24px serif, below grouped minimalist form fields, unfilled small rectangular selects, labels 15px sans, generous vertical rhythm:
Group title “发布范围”. Field “合集” value “不加入合集⌄”. Field “可见性” value “所有登录成员⌄”. Small understandable note “发布后，站内成员可以阅读。”
Next group “分类与标签”. Field “分类” value “随笔⌄”. Field “标签” value “生活，阅读” plain underline input, not capsule tags.
Next group “文章网址”. Value “slow-days” within thin rectangle; helper “用于文章链接”.
Next “封面图片” a small monochrome book photo preview 260x150, text “更换封面”.
Bottom small “草稿仅自己可见” and text links “保存草稿” “历史版本”. Do not show backend terminology, ACL, token, safe renderer explanations, request IDs or implementation architecture. Do not invent coediting, AI writing, scheduled publishing.
Generous blank margin below body, tiny global footer at bottom. Operational affordances remain legible and accessible. No collage in editor, no giant brand hero, no dark dashboard sidebar. One realistic page.
