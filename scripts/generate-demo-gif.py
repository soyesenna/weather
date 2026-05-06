from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path('docs/demo-assets/seoul-flood-demo.gif')
OUT.parent.mkdir(parents=True, exist_ok=True)
W, H = 390, 844
BLUE = '#3182f6'
BLUE50 = '#e8f3ff'
GREY50 = '#f9fafb'
GREY100 = '#f2f4f6'
GREY200 = '#e5e8eb'
GREY500 = '#8b95a1'
GREY600 = '#6b7684'
GREY900 = '#191f28'
RED = '#f04452'
ORANGE = '#fe9800'
YELLOW = '#ffc342'
GREEN = '#03b26c'

def font(size, bold=False):
    candidates = [
        '/System/Library/Fonts/AppleSDGothicNeo.ttc',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/SFNS.ttf',
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size=size, index=1 if bold else 0)
        except Exception:
            pass
    return ImageFont.load_default()

F12, F14, F16, F20, F26, F30 = font(12), font(14), font(16), font(20, True), font(26, True), font(30, True)

def rr(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def base(title='서울 침수 위험을\n한눈에 확인하세요'):
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    d.rectangle((0,0,W,92), fill='white')
    d.line((0,91,W,91), fill=GREY200)
    d.text((20,16), 'AI 기반 도시침수 대응 데모', fill=BLUE, font=F12)
    d.multiline_text((20,34), title, fill=GREY900, font=F26, spacing=2)
    return im, d

def bottom_nav(d, active=0):
    d.rectangle((0,H-70,W,H), fill='white', outline=GREY200)
    labels=['지도','경로','제보','관리']
    for i,l in enumerate(labels):
        x= W*i/4 + W/8
        d.ellipse((x-4,H-50,x+4,H-42), fill=BLUE if i==active else GREY500)
        tw=d.textlength(l,font=F12)
        d.text((x-tw/2,H-35),l,fill=GREY900 if i==active else GREY500,font=F12)

def frame_summary():
    im,d=base(); y=112
    rr(d,(20,y,370,y+150),16,BLUE50)
    d.text((40,y+22),'서울 전역 실시간 위험 요약',fill=BLUE,font=F12)
    d.text((40,y+48),'18',fill=GREY900,font=F30)
    d.text((40,y+84),'HIGH 위험 셀',fill=GREY600,font=F14)
    rr(d,(276,y+48,340,y+78),999,'#ffe8eb')
    d.text((293,y+54),'위험',fill=RED,font=F12)
    d.text((40,y+112),'이 지역 통행을 자제하고 가까운 대피소를 확인하세요.',fill=GREY600,font=F14)
    rr(d,(20,282,370,654),16,GREY50, GREY200)
    draw_cells(d, 32, 300)
    rr(d,(34,560,356,640),12,'white',GREY200)
    d.text((50,576),'강남구 현재 위험',fill=GREY900,font=F16)
    d.text((50,602),'점수 0.845 · 강수 60분 59.9mm',fill=GREY600,font=F12)
    bottom_nav(d,0); return im

def draw_cells(d,x0,y0):
    colors=[GREY100,YELLOW,ORANGE,RED]
    for r in range(10):
        for c in range(5):
            col=colors[(r*3+c*5)%4]
            rr(d,(x0+c*64,y0+r*24,x0+c*64+56,y0+r*24+18),5,col)

def frame_layers():
    im,d=base('위험 지도와\n정적 레이어')
    chips=['위험 셀','침수예상도','대피소','펌프장']
    x=20
    for ch in chips:
        w=int(d.textlength(ch,font=F12)+24); rr(d,(x,112,x+w,144),999,BLUE50 if ch!='펌프장' else 'white', BLUE if ch!='펌프장' else GREY200); d.text((x+12,121),ch,fill=BLUE if ch!='펌프장' else GREY600,font=F12); x+=w+8
    rr(d,(20,160,370,654),16,GREY50,GREY200); draw_cells(d,32,178)
    d.polygon([(80,240),(150,215),(192,270),(110,300)], fill='#b8d8ff', outline=BLUE)
    for x,y,t in [(250,260,'대'),(300,340,'대'),(220,430,'수')]: rr(d,(x-12,y-12,x+12,y+12),999,'white',BLUE); d.text((x-6,y-8),t,fill=BLUE,font=F12)
    rr(d,(34,560,356,640),12,'white',GREY200); d.text((50,576),'Kakao Map 레이어 렌더링',fill=GREY900,font=F16); d.text((50,602),'위험 셀 · 침수예상도 · 대피소 · 수위계',fill=GREY600,font=F12)
    bottom_nav(d,0); return im

def frame_route():
    im,d=base('안전경로를\n검사하세요')
    y=116; rr(d,(20,y,370,y+220),12,'white',GREY200); d.text((40,y+22),'안전경로 확인',fill=GREY900,font=F20)
    for i,t in enumerate(['출발지: 내 위치','도착지: 잠실역','도보']): rr(d,(40,y+60+i*46,350,y+96+i*46),12,GREY100,GREY200); d.text((54,y+70+i*46),t,fill=GREY600,font=F14)
    rr(d,(40,y+200,350,y+248),12,BLUE); d.text((143,y+214),'경로 위험 검사',fill='white',font=F14)
    rr(d,(20,380,370,640),16,GREY50,GREY200); d.line((70,560,320,430),fill=GREY900,width=5); d.line((95,520,295,405),fill='white',width=5)
    d.ellipse((72,540,100,568),fill=BLUE); d.ellipse((300,415,328,443),fill=GREEN); rr(d,(150,470,214,498),8,'#ffe8eb',RED); d.text((162,477),'HIGH',fill=RED,font=F12)
    rr(d,(36,592,354,630),10,'#ffe8eb'); d.text((50,602),'경로가 HIGH 위험 셀 1개 인근을 통과합니다.',fill=RED,font=F12)
    bottom_nav(d,1); return im

def frame_report():
    im,d=base('침수 상황을\n익명으로 제보')
    y=116; rr(d,(20,y,370,y+370),12,'white',GREY200); d.text((40,y+22),'익명 침수 제보',fill=GREY900,font=F20)
    for i,t in enumerate(['물높이: 무릎','보행, 차량 통행불가','사진 1장 선택(1.5MB 이하)','교차로 배수가 느립니다.']): rr(d,(40,y+62+i*56,350,y+102+i*56),12,GREY100,GREY200); d.text((54,y+73+i*56),t,fill=GREY600,font=F14)
    rr(d,(40,y+305,350,y+353),12,BLUE); d.text((151,y+319),'현재 위치로 제보',fill='white',font=F14)
    rr(d,(20,520,370,624),12,BLUE50); d.text((40,544),'제보가 접수됐습니다. (강남구)',fill=GREY900,font=F16); d.text((40,574),'운영자 콘솔과 시민 지도 마커에 표시됩니다.',fill=GREY600,font=F12)
    bottom_nav(d,2); return im

def frame_admin():
    im,d=base('운영자 콘솔로\n현황을 확인')
    y=116
    for title, rows, color in [('Top 20 위험 셀',['demo-0113  강남구  0.845','demo-0066  마포구  0.885'],RED),('최근 제보 50건',['22:13 강남구 무릎 사진','22:04 송파구 허벅지 -'],BLUE),('데이터 수집 헬스',['KMA 실황 ok','TOPIS degraded fallback'],GREEN)]:
        rr(d,(20,y,370,y+144),12,'white',GREY200); d.text((40,y+18),title,fill=GREY900,font=F20)
        for i,row in enumerate(rows): d.text((40,y+58+i*30),row,fill=color if i==0 else GREY600,font=F14)
        y+=160
    bottom_nav(d,3); return im

frames=[frame_summary(),frame_layers(),frame_route(),frame_report(),frame_admin(),frame_summary()]
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=[5000]*6, loop=0, optimize=True)
print(OUT, OUT.stat().st_size)
