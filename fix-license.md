# WasmTex 라이선스 문제 해결 절차

상태: 실행 중

대상: WasmTex, WasmTex를 브라우저 엔진으로 사용하는 비공개 Cortex

기본 전제: pdfLaTeX, XeLaTeX, LuaLaTeX를 브라우저에서 실행하며 XeLaTeX/LuaLaTeX 서버 실행으로 회피하지 않는다.

> 이 문서는 기술적 라이선스 준수 계획이며 법률 자문이 아니다. 특히 `pplib`의 권리 상태와 GPL 프로그램 및 Cortex 사이의 결합 정도는 상용 공개 전에 오픈 소스 전문 변호사의 검토를 받아야 한다.

## 1. 목표

이 작업의 최상위 목표는 **WasmTex는 공개하고 Cortex는 공개하지 않으면서, 두 프로젝트와 실제 웹 배포물 모두의 라이선스 의무를 충족하는 것**이다. WasmTex의 원저작 코드에 적용할 라이선스는 이 목표를 위한 설계 변수이며 MIT로 고정하지 않는다.

구체적으로 다음 다섯 가지를 동시에 만족해야 한다.

1. WasmTex source 저장소와 필요한 engine release source를 공개한다.
2. Cortex의 제품 UI, 협업 기능, 인증, 결제, 저장소, AI 기능과 서버 코드는 비공개로 유지한다.
3. WasmTex가 브라우저에서 pdfLaTeX, XeLaTeX, LuaLaTeX를 계속 제공한다.
4. 사용자가 내려받는 엔진 바이너리의 소스·라이선스·고지 의무를 충족한다.
5. `pplib`처럼 재배포 권한을 입증할 수 없는 구성요소를 공개 배포물에서 제거하거나, 권리자로부터 충분한 라이선스를 확보한다.

목표는 생성 PDF의 바이트가 과거 구현과 항상 동일하도록 만드는 것이 아니다. 시각 결과, 페이지 기하, TeX 동작, Lua API 호환성을 검증 가능한 수준으로 유지하는 것이 목표다. PDF의 객체 순서, 압축 방식, 생성 시각과 같은 내부 바이트는 구현이 바뀌면 달라질 수 있다.

## 2. 현재 결론

### 2.1 WasmTex 원저작 코드의 라이선스는 아직 고정된 요구사항이 아니다

현재 WasmTex가 직접 작성한 TypeScript SDK, UI 연결 코드와 그 밖의 독자 코드는 MIT로 표시되어 있다. 이것은 현 상태일 뿐 최종 목표가 아니다. Cortex를 비공개로 유지하면서 WasmTex를 공개할 수 있다면 WasmTex 원저작 코드는 MIT, BSD, MPL, LGPL, GPL, dual license 또는 구성요소별 서로 다른 라이선스를 선택할 수 있다. 실제 선택은 Cortex가 어떤 WasmTex 코드를 직접 import/link하는지와 engine Worker 경계에 따라 정한다.

다만 Cortex가 WasmTex의 host-facing SDK를 main bundle에 직접 import하는 현재와 같은 사용 형태를 유지한다면, 그 SDK에는 proprietary 사용을 허용하는 permissive license 또는 별도 commercial license를 두는 것이 가장 단순하다. WasmTex 원저작 코드 전체를 GPL로 바꾸면서 Cortex가 이를 직접 결합하면 오히려 Cortex 비공개 목표가 어려워질 수 있다. 전체를 GPL로 공개하려면 Cortex는 GPL 코드를 직접 import하지 않고 독립 Worker protocol만 소비하도록 경계를 더 엄격히 만들어야 한다.

따라서 권장되는 기본 구조는 다음과 같지만, 검토 결과에 따라 변경할 수 있다.

- Cortex가 직접 사용하는 host SDK와 protocol 정의: proprietary 결합을 허용하는 permissive 또는 dual license
- TeX 엔진 Worker, WASM, Emscripten glue와 대응 소스: 결합된 상위 구성요소가 요구하는 GPL 조건
- TeX Live 패키지·폰트·데이터와 그 밖의 제3자 구성요소: 각자의 원래 라이선스

저장소가 공개된다는 사실이 모든 파일을 하나의 라이선스로 재허가해야 한다는 뜻은 아니다. 루트 `LICENSE`, 파일별 SPDX, `LICENSES/`, manifest와 notices가 각 범위를 모호하지 않게 나타내야 한다. 현재 루트 `LICENSE`와 npm 패키지의 `MIT` 표시는 변경하기 전까지는 **직접 작성한 SDK의 현행 라이선스**일 뿐 엔진과 제3자 자료에 적용되지 않는다.

### 2.2 사용하는 엔진과 주요 라이선스 성격

| 사용자 기능 | 실제 파이프라인 | 주요 라이선스 성격 | 현재 판단 |
| --- | --- | --- | --- |
| pdfLaTeX | pdfTeX → PDF | pdfTeX 및 결합 라이브러리 때문에 GPL 배포물 | 브라우저 배포 가능하나 GPL 대응 소스 필요 |
| XeLaTeX | XeTeX → XDV → dvipdfmx → PDF | XeTeX 자체 고지 외에 dvipdfmx와 결합 라이브러리의 GPL 의무 존재 | WTPDF/Xpdf 후보에서 `pplib` 제거와 자체 corpus의 geometry/visual parity를 확인했으나 대응 소스·고지·확장 compatibility gate가 남음 |
| LuaLaTeX | LuaHBTeX → PDF | GPL-2.0-or-later 계열 배포물 | 현재 LuaHBTeX WASM의 `pplib` 정적 링크가 차단 요소 |
| SyncTeX | TeX Live reference parser를 TypeScript로 포팅 | 상위 MIT 유사 고지 유지 필요 | 원저작권·허가문을 소스와 배포 고지에 보존 |
| TeX Live 패키지·폰트·Lua·포맷·ICU 데이터 | 버전별 CDN에서 지연 로드 | 파일마다 라이선스가 다름 | CDN manifest와 파일별 provenance가 필요 |
| Monaco Editor, PDF.js | host가 제공하는 peer | host의 실제 번들 여부에 따라 의무 발생 | WasmTex가 복제해 배포하지 않으면 peer로 명시 |
| pdf-lib | incremental PDF splice에서만 쓰는 optional peer | MIT | 실제 포함한 제품에서 고지 유지 |

웹에서 WASM, JavaScript glue, TeX Live 파일을 사용자 브라우저로 전송하는 것은 단순한 서버 내부 사용이 아니라 배포로 취급해 준비해야 한다. GPL 엔진을 웹에서 실행한다는 사실 자체가 Cortex의 모든 서버 코드를 자동으로 공개하게 만드는 것은 아니지만, 사용자에게 전달되는 결합물과 엔진의 완전한 대응 소스는 공개해야 한다.

### 2.3 FastLaTeX를 WasmTex로 바꾸는 것만으로 `pplib` 문제가 없어지지는 않는다

조사 당시 FastLaTeX와 WasmTex는 동일한 TeX Live 계열 소스와 `pplib` 정적 링크를 사용했다. 이후 WasmTex의 XeTeX 후보는 독립 WTPDF/Xpdf adapter로 전환해 `pplib`를 link line과 산출물에서 제거했다. LuaHBTeX는 아직 다음 지점에서 `pplib`를 링크한다.

- `wasm-build/build-luatex.sh`

그러므로 Cortex에서 FastLaTeX asset URL을 WasmTex asset URL로 바꾸는 일은 구조와 유지보수 측면에서는 개선이지만 라이선스 해결 자체는 아니다. WasmTex가 더 적합한 이유는 엔진 배포 manifest와 release gate를 갖고 있어 문제를 명시적으로 차단할 수 있기 때문이다.

현재 `public/wasmtex/2025/LICENSE-MANIFEST.json`은 엔진을 `development-only`로 표시하고 다음 차단 사유를 기록한다.

- `complete-corresponding-source`
- `pplib-license-evidence`
- `texlive-provenance`

이 상태에서 label만 변경하거나 차단 목록만 지우고 상용 배포해서는 안 된다.

## 3. 대화에서 도출된 판단 기록

### 3.1 최초 MIT 검토와 목표의 수정

고정된 TeX Live 소스를 직접 빌드한다는 점 때문에 “외부 바이너리를 쓰지 않는다”는 사실은 면책 사유가 아니다. 소스를 직접 컴파일하고 정적으로 링크하면 오히려 완성된 WASM에 각 구성요소의 결합·소스 제공 의무가 직접 적용된다.

최초 검토에서는 현재 상태에 맞춰 “WasmTex 원저작 부분은 MIT, 엔진과 데이터는 개별 라이선스”라는 구조를 설명했다. 이후 목표를 “MIT 유지”가 아니라 “WasmTex 공개, Cortex 비공개, 양쪽 모두 준수”로 명확히 수정했다. 그러므로 MIT는 가능한 선택지이자 현재 상태이지 불변 조건이 아니다. 향후 라이선스 선택은 이 최상위 목표에 유리한지를 기준으로 다시 결정한다.

### 3.2 pdfLaTeX, XeLaTeX, LuaLaTeX 사용 여부

프로젝트는 세 엔진을 모두 실제 기능으로 제공한다. pdfLaTeX는 pdfTeX, XeLaTeX는 XeTeX와 dvipdfmx, LuaLaTeX는 LuaHBTeX를 사용한다. 따라서 pdfLaTeX만 고려한 라이선스 설계로는 충분하지 않다.

### 3.3 Cortex 비공개 유지 가능성

GPL 엔진을 독립된 Worker 배포 단위로 만들고 Cortex가 단순한 파일·명령·결과 protocol로 이를 호출하게 하면, Cortex의 독자적인 애플리케이션 코드를 비공개로 유지할 근거가 강해진다. 다만 경계 판단은 파일명이나 저장소 분리만으로 결정되지 않고 실제 결합 방식과 통신 의미에 따라 달라진다.

따라서 생성된 GPL JavaScript module을 Cortex main bundle에 import하거나 엔진 내부 객체를 직접 공유하는 방식은 피한다. 공개 엔진은 별도 Worker와 별도 산출물로 배포하고 Cortex는 공개된 안정 protocol의 소비자가 되도록 한다.

### 3.4 XeLaTeX/LuaLaTeX의 서버 실행은 해결책이 아님

제품 요구상 XeLaTeX와 LuaLaTeX를 서버로 옮길 수 없다. 이 문서는 서버 offload를 회피책으로 취급하지 않는다. 동일한 호스트 독립적 엔진이 브라우저와 Node에서 동작한다는 현재 실행 모델과 client-first 기본값을 유지한다.

### 3.5 `pplib`가 무엇이며 왜 문제가 되는가

`pplib`는 LuaTeX를 위해 만들어진 read-only PDF parsing/disassembly 라이브러리다. 고정한 원본 TeX Live 빌드 설정은 XeTeX, LuaTeX, LuaHBTeX의 필수 라이브러리로 이를 선언한다. WasmTex patch는 XeTeX dependency를 Xpdf/WTPDF로 바꿨지만 LuaHBTeX WASM은 아직 `pplib`를 정적으로 링크한다. 교체 전 XeTeX는 비공개 비교 기준에만 남기고 공개 artifact로 배포하지 않는다.

공개 `pplib` 저장소와 확인 가능한 이력에서는 라이브러리 본체 전체를 포괄하는 `LICENSE` 또는 `COPYING` 파일을 찾지 못했다. 일부 유틸리티 파일의 개별 라이선스가 라이브러리 전체의 허가를 대신하지 않는다. 이는 “반드시 독점 소프트웨어”라는 증명은 아니지만, 제3자가 브라우저 바이너리와 대응 소스를 재배포할 충분한 권리를 입증할 수 없는 상태다.

TeX Live의 일반 정책은 포함 자료를 자유롭게 사용·복사·수정·재배포할 수 있어야 한다고 밝히고 있다. 이것은 유리한 정황이지만 `pplib` 저작권자가 부여한 구성요소별 허가문을 대신하기에는 부족하다. 가장 낮은 기술 위험의 해결책은 저작권자 또는 TeX Live maintainer가 명시적 라이선스를 upstream에 추가하는 것이다.

### 3.6 `pplib`만 해결하면 모든 문제가 끝나는가

아니다. `pplib`는 현재 XeTeX/LuaHBTeX 배포를 막는 핵심적인 불명확성이다. 이를 적법하게 라이선스하거나 제거하면 가장 큰 차단 요소 하나가 해소된다. 그러나 GPL 대응 소스, LGPL 정적 링크의 relink 가능 자료, Emscripten ports 고지, TeX Live 패키지·폰트·데이터의 provenance, SyncTeX와 makeindex의 별도 고지는 계속 필요하다.

### 3.7 Cortex 일부 공개의 효과

Cortex 일부 또는 전체를 공개해도 `pplib` 권리자가 부여하지 않은 재배포 허가가 새로 생기지 않는다. 그러므로 Cortex 공개는 `pplib` 문제의 대체 해결책이 아니다.

다만 `pplib`를 해결한 뒤 엔진 Worker와 그 대응 소스를 공개하고 Cortex 제품 코드를 비공개로 유지하면, GPL 엔진과 proprietary 애플리케이션의 경계를 설명하고 감사하기가 훨씬 쉬워진다. 이것이 이 문서가 권장하는 구조다.

### 3.8 `pplib` 교체가 결과를 바꾸는가

공개/비공개 저장소 분리 자체는 렌더링에 영향을 주지 않는다. PDF parser 구현을 교체하는 일은 호환성 위험이 있다. 다만 그 위험은 엔진마다 크게 다르다.

- 외부 PDF를 사용하지 않는 문서는 parser 경로를 거의 타지 않으므로 TeX layout과 렌더 결과가 바뀌지 않을 가능성이 높다.
- XeTeX는 `pplib`를 주로 PDF 페이지 수, 선택된 page box, rotation 확인에 사용하고 실제 embedding은 dvipdfmx가 수행한다. 교체 범위가 비교적 작다.
- LuaHBTeX는 PDF object graph, xref/ref, dictionary/array, raw/decoded stream, 암호화 PDF, `pdfe`, `pdfscanner` API까지 사용한다. 같은 시각 결과를 낼 수 있지만 더 넓은 호환성 검증이 필요하다.
- PDF의 바이트, 객체 순서, 압축 결과는 달라질 수 있다. 이것만으로 렌더링 회귀로 판단해서는 안 된다.

따라서 “Xpdf로 바꾸면 결과가 절대 바뀌지 않는다”고 약속해서는 안 된다. 기존 `pplib` 개발 빌드와 새 구현을 동일 corpus에 실행하는 differential gate를 통과한 뒤에만 호환성을 주장한다.

## 4. `pplib` 해결 경로

두 경로 중 하나를 완료해야 한다. 두 경로를 동시에 진행할 수 있지만 공개 릴리스에는 하나의 명확한 근거가 필요하다.

### 경로 A: 명시적 upstream 라이선스 확보

공학적 위험이 가장 낮은 경로다. `pplib` 저작권자에게 라이브러리 본체와 WasmTex가 사용하는 버전을 포괄하는 명시적 라이선스를 요청한다.

요청해야 할 권리는 최소한 다음을 포함한다.

- 사용, 복사, 수정, 정적 링크, WASM 컴파일, 상업적 배포
- 대응 소스 재배포
- 수령자가 다시 수정·재배포할 권리
- 현재 TeX Live에 포함된 과거 코드에도 적용되는지에 대한 명확한 범위

MIT, BSD-2-Clause, GPL-2.0-or-later 등 최종 엔진과 호환되는 표준 라이선스를 upstream 저장소에 `LICENSE`와 SPDX 표기로 추가하는 것이 가장 좋다. 회사 한 곳에만 주는 비공개 실행 허가는 GPL 결합물의 downstream 재배포 권리를 충족하지 못할 수 있으므로 충분하지 않다.

### 경로 B: `pplib`를 Xpdf 기반 독립 adapter로 교체

이 문서의 기본 구현 계획이다. WasmTex는 이미 pdfTeX 빌드에서 TeX Live에 포함된 Xpdf 4.04를 빌드하고 링크한다. 따라서 새 WASM dependency와 toolchain을 도입하는 Poppler 또는 QPDF보다 빌드 위험이 낮다.

Xpdf 4.04의 TeX Live 사본은 GPL v2 또는 GPL v3 조건으로 배포할 수 있다고 명시한다. XeTeX의 최종 WASM은 GPL 엔진 배포물로 취급하면 되며 LuaHBTeX는 이미 GPL 배포물이다. 새 adapter 자체는 WasmTex의 독자 코드로 작성하되, Xpdf와 결합한 최종 산출물은 GPL 조건으로 배포한다.

QPDF는 강력한 대안이지만 새 WASM 빌드, API 통합, binary size 검증이 필요하다. Apache-2.0 코드를 GPL 결합물에 넣는 경우 최종 Lua 바이너리의 GPLv3 선택도 검토해야 한다. Poppler 역시 큰 새 dependency와 API churn을 가져온다. 현재 조건에서는 TeX Live가 이미 사용하는 Xpdf가 가장 보수적인 선택이다.

## 5. Xpdf 교체 설계

### 5.1 독립 API를 만든다

`pplib`의 `ppapi.h`, struct layout, 이름 또는 구현을 복사해 호환 shim을 만들어서는 안 된다. 권리가 불명확한 header 표현까지 새 코드에 고착시킬 수 있기 때문이다.

다음과 같은 WasmTex 소유의 독립 C ABI를 만든다.

```text
wasm-build/pdf-backend/wtpdf.h
wasm-build/pdf-backend/wtpdf-xpdf.cc
wasm-build/pdf-backend/README.md
```

API는 불투명 handle과 WasmTex 고유 이름을 사용하고 필요한 기능만 제공한다.

- 파일 및 메모리에서 document 열기/닫기
- PDF version, catalog, trailer, info, page 접근
- page count, page box, rotation
- null, boolean, integer, real, name, string, array, dictionary, stream, indirect reference 구분
- array/dictionary 순회와 key lookup
- object number/generation을 포함한 reference 해석
- raw stream과 decoded stream의 명시적 분리
- 암호화 여부와 password 처리
- 오류, 경고, 메모리 사용량 전달

Xpdf는 PDF를 읽고 해석하는 역할만 한다. LuaHBTeX의 기존 `pdftoepdf.c`가 출력 PDF의 serialize와 object 복사를 계속 담당해야 한다. Xpdf로 입력 PDF 전체를 재작성하면 출력 변화와 회귀 범위가 불필요하게 커진다.

### 5.2 호환성 보존 규칙

adapter는 다음 의미를 명시적으로 보존해야 한다.

- indirect object의 object number와 generation number
- direct object와 indirect reference의 구분
- integer와 real의 타입 구분
- PDF string의 원시 byte와 hex-string 여부
- dictionary key 순회 순서가 공개 Lua API에 노출되는 경우의 기존 순서
- decode를 요청하지 않았을 때의 원시 압축 stream
- page box의 누락 시 fallback 규칙
- page rotation 정규화 규칙
- xref table, xref stream, object stream 안의 object 접근
- 손상되었거나 암호화된 PDF의 성공/실패 및 오류 전달 방식

### 5.3 TeX Live 수정 방식

상위 TeX Live 소스를 임의 fork로 장기간 유지하지 않는다. `docs/texlive-upgrade.md`의 원칙에 따라 가능한 변경은 외부 adapter와 interposition으로 두고, 필요한 최소 변경만 추적 가능한 patch로 적용한다.

예상 파일:

```text
wasm-build/patches/texlive-wtpdf.patch
```

빌드는 먼저 `git apply --check`로 정확한 상위 소스에 적용되는지 검증하고, mismatch가 있으면 즉시 실패해야 한다. TeX Live 연도 업그레이드 때 silent fuzz로 적용되어서는 안 된다.

patch가 다룰 후보는 다음과 같다.

- `texk/web2c/ac/web2c.ac`: XeTeX/LuaTeX/LuaHBTeX의 필수 dependency를 `pplib`에서 Xpdf/WTPDF로 변경
- `texk/web2c/xetexdir/am/xetex.am`
- `texk/web2c/luatexdir/am/luatex.am`
- `texk/web2c/luatexdir/am/libluatex.am`
- 필요하면 Lua misc library의 dependency 목록
- `texk/web2c/xetexdir/pdfimage.cpp`
- `texk/web2c/xetexdir/XeTeX_ext.c`
- `texk/web2c/luatexdir/image/epdf.h`
- `texk/web2c/luatexdir/image/pdftoepdf.c`
- `texk/web2c/luatexdir/lua/lpdfelib.c`
- `texk/web2c/luatexdir/lua/lpdfscannerlib.c`

autoconf/automake 입력을 바꾼 뒤 top-level `reautoconf`를 실행하고, 생성 파일을 대응 소스에 포함하거나 재생성 절차를 정확히 기록한다.

### 5.4 XeTeX부터 교체한다

XeTeX가 사용하는 표면은 상대적으로 작다.

1. PDF file/memory open
2. 페이지 수 조회
3. MediaBox, CropBox, BleedBox, TrimBox, ArtBox 조회와 fallback
4. 선택 페이지의 rotation 및 bounds 계산
5. 오류와 version banner 처리

실제 PDF embedding은 dvipdfmx가 계속 수행한다. 먼저 XeTeX adapter를 완성해 page selection, box, rotation regression을 제거한 후 LuaHBTeX 범위로 확장한다.

### 5.5 LuaHBTeX를 단계적으로 교체한다

LuaHBTeX는 다음 순서로 확장한다.

1. `graphicx`를 통한 기본 PDF 이미지 포함
2. multipage PDF 및 `pdfpages`
3. direct/indirect object, reference, xref stream, object stream
4. raw/decoded stream과 filter 처리
5. Lua `pdfe` API
6. Lua `pdfscanner` API
7. 암호화 PDF, malformed PDF, resource limit, 메모리 해제

Lua API를 사용하지 않는 일반 문서만 성공한다고 완료로 판단해서는 안 된다. `pdfe`와 `pdfscanner`의 관찰 가능한 반환 타입, string byte, iteration 순서, 오류가 기존 동작과 일치해야 한다.

### 5.6 빌드에서 완전히 제거한다

Dockerfile, Makefile, build script를 다음과 같이 바꾼다.

1. 고정된 TeX Live source를 가져온다.
2. `texlive-wtpdf.patch`를 검증 후 적용한다.
3. 기존 pdfTeX와 동일한 고정 Xpdf 4.04를 빌드한다.
4. `wtpdf-xpdf.cc`를 컴파일한다.
5. XeTeX/LuaHBTeX link line에서 `libpplib.a`를 제거한다.
6. WTPDF adapter와 `libxpdf`를 링크한다.
7. Phase 1 native tool 빌드에도 불필요한 `pplib`가 요구되지 않게 한다.
8. 공개 대응 소스 archive가 `libs/pplib` 없이 깨끗한 환경에서 엔진을 재현하는지 검증한다.

최종 WASM, link map, 중간 archive와 source bundle에서 다음 흔적이 없어야 한다.

```text
libpplib.a
ppdoc_
ppdict_
pparray_
ppstream_
ppref_
libs/pplib
```

사용하지 않는 코드를 full TeX Live archive에 그대로 넣어 공개하는 방식도 피한다. `pplib` 없는 최소 대응 소스로 실제 rebuild가 가능해야 한다.

## 6. 호환성 검증 계획

현재 golden test는 PDF signature, page count, XDV geometry와 같은 구조적 smoke 검사를 중심으로 한다. 이것만으로 PDF parser 교체를 승인하기에는 부족하다.

### 6.1 비교 빌드

공개하지 않는 내부 기준용으로 현재 `pplib` 개발 빌드와 Xpdf/WTPDF 후보 빌드를 동일한 TeX Live commit, 동일 format, 동일 input file, 동일 환경 변수로 만든다. 테스트가 끝난 뒤 제품에는 `pplib` fallback이나 선택 option을 남기지 않는다.

### 6.2 PDF corpus

최소 corpus에는 다음을 포함한다.

- 단일/다중 페이지 PDF
- 서로 다른 MediaBox/CropBox/BleedBox/TrimBox/ArtBox
- 0/90/180/270도 rotation
- classic xref table과 xref stream
- object stream
- Flate, ASCII85, LZW 등 지원 filter 조합
- binary string, hex string, Unicode metadata
- 투명도, annotation, form XObject, 중첩 resource
- 암호화 PDF와 잘못된 password
- 일부 손상되었지만 기존 parser가 복구하는 PDF
- 크거나 깊게 중첩된 object로 만든 resource-limit fixture

TeX corpus에는 `graphicx`, `pdfpages`, TikZ/PGF의 PDF import와 `pdfe`, `pdfscanner`를 직접 사용하는 Lua fixture를 포함한다.

### 6.3 비교 항목

두 빌드에 대해 다음을 자동 비교한다.

- compile 성공/실패와 exit code
- TeX 오류·경고·log의 의미 있는 차이
- 페이지 수와 각 페이지 크기
- XeTeX XDV geometry와 page box/rotation 선택
- 고정 renderer·고정 DPI의 raster pixel diff
- 텍스트 추출 결과와 글자 위치
- PDF 구조 validator 결과
- `pdfe`/`pdfscanner` 결과를 정규화한 JSON fixture
- 브라우저와 Node host의 구조적 parity
- WASM/JS 크기, 첫 로드 시간, compile 시간, peak memory

metadata timestamp, object 번호가 외부 API에 노출되지 않는 경우의 내부 object order, 압축률처럼 렌더링과 API 의미에 영향이 없는 차이는 별도로 분류한다.

### 6.4 릴리스 승인 기준

다음을 모두 만족할 때만 교체를 호환된 것으로 승인한다.

- 예상하지 못한 compile 성공률 회귀가 없다.
- page count, page size, box, rotation, XDV geometry가 일치한다.
- 정상 corpus의 raster diff가 0이거나, 검토·기록된 매우 작은 허용치 안에 있다.
- `pdfe`/`pdfscanner`의 공개 동작 차이가 없거나 migration note와 versioning으로 명시적으로 승인되었다.
- malformed/encrypted 입력에서 crash, hang, unbounded allocation이 없다.
- 브라우저와 Node가 같은 결과를 낸다.
- 허용 가능한 bundle size와 성능 budget을 만족한다.

## 7. Cortex를 비공개로 유지하는 구조

### 7.1 공개할 엔진 배포 단위

다음은 독립된 공개 `wasmtex-engine` 또는 `engine-release` 배포물에 포함한다.

- engine Worker controller와 entry point
- Emscripten 생성 glue 및 이를 생성하는 원본
- WASM을 만드는 WasmTex 원본 소스
- WTPDF interface와 Xpdf adapter
- TeX Live 최소 patch
- 정확한 Dockerfile, Makefile, script, compiler/linker flag
- 고정된 TeX Live/Xpdf/Emscripten/ports revision
- Worker message protocol과 TypeScript schema
- 엔진별 `LICENSE-MANIFEST.json`
- `LICENSES/`, `THIRD_PARTY_NOTICES.md`, source offer/source URL
- 실제 배포 byte를 재현하거나 동등한 바이너리를 만들 수 있는 complete corresponding source archive

엔진 artifact와 대응 소스에는 동일한 release ID와 content hash를 부여한다.

### 7.2 비공개로 유지할 Cortex 영역

다음은 엔진과 독립적으로 작성되고 단순 protocol만 소비하도록 유지한다.

- React UI와 Monaco integration
- 문서 편집 상태와 제품 UX
- 인증, 조직, 권한, 결제
- collaboration, presence, comments
- 프로젝트 저장소와 version history
- AI 기능과 business logic
- API 서버, 데이터베이스, observability
- 엔진과 무관한 PDF viewer UI

“Cortex 파일 일부를 공개했다”는 사실보다 실제 경계가 중요하다. 공개 Worker의 생성 glue를 Cortex main bundle에 import하지 않고, Worker와 main app이 같은 JS realm/address space를 공유하지 않게 한다.

### 7.3 권장 protocol

protocol은 다음과 같이 일반적인 데이터 교환에 한정한다.

```text
initialize(engineVersion, assetBaseUrl, options)
writeFile(path, bytes)
removeFile(path)
compile(entryPath, engine, options)
readFile(path)
cancel(jobId)
dispose()

result: status, logs, diagnostics, outputFiles, timing
```

TeX engine의 내부 pointer, Xpdf object, kpathsea structure 또는 generated runtime object를 main app에 노출하지 않는다. protocol은 versioned schema로 공개하고 독립적인 host가 동일 Worker를 사용할 수 있을 정도로 완결되게 문서화한다.

### 7.4 배포 및 약관

- Cortex app bundle과 engine Worker를 서로 다른 build job과 manifest로 만든다.
- 가능하면 URL namespace와 cache policy도 분리한다. 같은 hostname 사용 자체가 결합을 결정하지는 않는다.
- 엔진 로딩 화면이나 제품의 오픈 소스 고지에서 source와 license로 가는 지속적인 링크를 제공한다.
- Cortex 이용약관의 역공학·재배포 제한은 GPL 엔진과 다른 오픈 소스 구성요소에 적용되지 않는다고 명시한다.
- DRM, signature check 또는 기술적 제한으로 사용자의 GPL 권리 행사를 막지 않는다.
- GPL 엔진을 수정한 버전도 동일한 대응 소스와 설치/실행 정보를 함께 배포한다.

이 구조는 GPL 프로그램과 독립 프로그램의 경계를 강화하지만 법적 확정 판정은 아니다. 상용 배포 전에 실제 bundle, Worker 생성 방식, protocol과 약관을 함께 검토받는다.

## 8. `pplib` 외에 남는 배포 의무

### 8.1 Complete corresponding source

사용자에게 전송되는 각 엔진 byte와 정확히 대응하는 다음 자료가 필요하다.

- 고정 TeX Live source revision
- WasmTex glue, adapter, patch
- Emscripten version과 설정
- Docker image 정의와 system dependency
- build/configure/link command와 환경 변수
- 생성된 format, preload artifact, 필요한 code generation input
- 설치·실행에 필요한 정보

단순히 TeX Live GitHub 링크만 제공하거나 현재 main branch를 가리키는 것은 충분하지 않다.

### 8.2 LGPL 및 Emscripten ports

FreeType, ICU, HarfBuzz, Graphite2, TECkit, zlib, libpng, zziplib 등 실제 link된 library의 정확한 버전과 라이선스를 inventory한다. LGPL library가 정적으로 WASM에 링크되면 적용 버전에 따라 object/relink material 또는 다른 허용 방식을 제공해야 할 수 있다.

Emscripten 3.1.46 자체와 ports가 가져오는 원본의 license file을 source bundle 및 notices에 보존한다. “Emscripten port”라는 한 줄 고지는 개별 library 의무를 대체하지 않는다.

### 8.3 TeX Live CDN 파일

지연 로드라도 브라우저에 전달되는 파일은 배포 inventory에 포함한다. 파일별로 최소한 다음을 기록한다.

- logical path와 SHA-256
- TeX Live package/version/revision
- 원본 source URL
- license identifier 또는 upstream license text 위치
- font인 경우 embedding/modification 조건
- 생성 파일인 경우 preferred source와 생성 방법

라이선스를 확인하지 못한 패키지·폰트는 production allowlist에 들어가지 않게 fail-closed로 운영한다.

### 8.4 별도 구성요소

- SyncTeX TypeScript port에는 원 parser의 저작권과 허가문을 source header와 배포 고지에 유지한다.
- makeindex의 특별 배포 조건과 source 제공 문구를 확인해 manifest에 반영한다.
- BibTeX/BibTeX8, kpathsea, dvipdfmx의 개별 고지를 엔진별 manifest에 연결한다.
- Monaco, PDF.js, pdf-lib은 host가 실제 bundle하는 제품에서 해당 notice를 제공한다. WasmTex package가 peer만 선언하고 byte를 배포하지 않는 사실도 명확히 기록한다.

## 9. 실행 체크리스트

아래 항목은 production release를 위한 작업 목록이다. 문서가 존재한다는 이유만으로 완료 표시하지 말고, 해당 release artifact와 증거가 저장되었을 때만 체크한다.

### A. 사실관계와 권리 근거 고정

- [ ] 배포 예정인 pdfTeX, XeTeX, dvipdfmx, LuaHBTeX, BibTeX, BibTeX8, makeindex, kpathsea의 정확한 TeX Live commit을 고정한다.
- [ ] Emscripten 3.1.46과 모든 ports의 exact source revision 및 archive hash를 기록한다.
- [ ] 각 최종 WASM의 link map을 생성하고 정적·동적 구성요소 inventory를 만든다.
- [ ] 현재 `pplib` 공개 저장소와 TeX Live 사본에서 본체 전체를 포괄하는 라이선스가 없는지 legal review용 증거를 보존한다.
- [ ] `pplib` 저작권자와 TeX Live maintainer에게 표준 upstream 라이선스 추가 가능성을 문의한다.
- [ ] 확보한 회신이 사용·수정·정적 링크·WASM 및 상업 재배포·downstream 재배포를 실제로 허용하는지 법률 검토한다.
- [ ] upstream 라이선스가 확보되면 해당 commit, 원문, 적용되는 과거 버전 범위를 archive한다.
- [ ] upstream 라이선스가 충분하지 않으면 Xpdf 교체 경로를 최종 결정으로 기록한다.

### B. WTPDF/Xpdf 설계

- [x] `wasm-build/pdf-backend/wtpdf.h`에 `pplib` 표현을 복사하지 않은 독립 opaque-handle ABI를 설계한다.
- [x] API별로 XeTeX 또는 LuaHBTeX의 실제 caller와 필요한 observable semantics를 표로 만든다. ABI v1의 XeTeX 범위와 향후 LuaHBTeX 보존 조건을 `wasm-build/pdf-backend/README.md`에 기록했다.
- [x] object/ref, integer/real, string bytes와 lexical form, stream raw/decode, dict order, page box, rotation 보존 규칙을 specification으로 작성한다. `wasm-build/pdf-backend/README.md`의 ABI v2 object model과 LuaHBTeX caller map에 기록했다.
- [x] Xpdf 4.04의 정확한 source와 GPL v2/v3 라이선스 원문을 고정한다. TeX Live commit `143f1723353b20202645f241db429b080a8adcdf`와 `LICENSES/Xpdf-4.04-*`, `LICENSES/GPL-3.0.txt`에 기록했다.
- [x] adapter의 error ownership, buffer ownership, lifetime, memory limit을 정의한다. 메모리 입력은 복사하며, `max_input_bytes`와 Worker 수명/스레드 제약을 명시했다.
- [x] 암호화 PDF의 password callback과 오류 모델을 정의한다. ABI v1은 open-time owner/user password와 `WTPDF_STATUS_ENCRYPTED`를 사용한다.
- [x] WTPDF 단위 테스트용 C/C++ fixture를 만든다. `wtpdf-smoke.cc`를 Emscripten으로 빌드·실행하는 gate를 XeTeX 빌드에 포함했다.

### C. XeTeX 교체

- [x] Xpdf 기반 document open/close를 구현한다.
- [x] file input과 memory input을 모두 구현한다.
- [x] page count 조회를 구현한다.
- [x] 다섯 page box와 표준 fallback 규칙을 구현한다. 정상 fixture의 BleedBox→CropBox fallback을 원격 WASM smoke test에서 확인했으며 malformed PDF의 과거-parser 차이는 differential gate에 남긴다.
- [x] page rotation과 bounds 계산을 구현한다. 음수 rotation 정규화와 기존 XeTeX TeX-point 계산 경로를 보존했다.
- [x] `pdfimage.cpp`를 WTPDF API로 전환한다.
- [x] `XeTeX_ext.c`의 `pplib` version 의존성을 제거한다.
- [x] XeTeX build metadata에서 `pplib` dependency를 제거한다.
- [x] XeTeX link line에서 `libpplib.a`를 제거하고 WTPDF/Xpdf를 링크한다. `2c53a86`의 원격 link map과 artifact 감사를 통과했다.
- [x] 자체 생성 XeTeX PDF corpus의 page selection/box fallback/rotation/inclusion geometry differential test를 통과한다. `docs/license-evidence/xetex-geometry-differential-dba9069.md`에 같은 TeX Live revision의 결과와 hash를 기록했다.
- [x] 자체 생성 vector PDF corpus를 고정 xdvipdfmx와 144 DPI renderer로 변환한 XeTeX visual differential test를 통과한다. `docs/license-evidence/xetex-visual-differential-6daf095.md`에 11페이지 결과를 기록했다.
- [ ] xref stream, object stream, 암호화·손상 PDF와 실제 문서 corpus를 포함한 확장 XeTeX visual differential test를 통과한다.
- [x] dvipdfmx embedding 경로가 변경되지 않았음을 확인한다. TeX Live patch는 dvipdfmx 소스를 수정하지 않으며 같은 원격 빌드에서 dvipdfmx WASM 재빌드와 validation을 통과했다.

### D. LuaHBTeX 교체

- [x] WTPDF v2에 기본 PDF object type과 document/catalog/trailer/info/page 접근을 구현하고 native/WASM smoke를 통과한다. `docs/license-evidence/wtpdf-v2-89f37e1.md`에 입력 hash와 결과를 기록했으며 LuaHBTeX caller 전환은 아래 별도 항목으로 남아 있다.
- [x] WTPDF v2에 array/dictionary lookup 및 source-order 순회를 구현한다.
- [x] WTPDF v2에 direct object, indirect reference, object number/generation 보존과 명시적 resolve를 구현한다.
- [ ] classic xref, xref stream, object stream을 지원한다.
- [x] WTPDF v2에 독립 cursor를 사용하는 raw stream과 decoded stream reader를 구분해 구현한다. filter별 differential coverage와 decoded-output limit은 남아 있다.
- [x] WTPDF v2가 embedded-NUL string bytes, literal/hex lexical form과 decoded name bytes를 보존한다. LuaHBTeX serializer와 `pdfe` 연결은 아직 남아 있다.
- [ ] `epdf.h`를 WTPDF abstraction으로 전환한다.
- [ ] `pdftoepdf.c`를 WTPDF API로 전환하되 기존 output serializer를 유지한다.
- [ ] `lpdfelib.c`의 `pdfe` API를 기존 observable contract에 맞게 전환한다.
- [ ] `lpdfscannerlib.c`의 `pdfscanner` API를 기존 observable contract에 맞게 전환한다.
- [ ] 암호화 PDF와 password 오류를 구현한다.
- [ ] malformed PDF의 복구/실패 동작과 resource limit을 구현한다.
- [ ] 모든 성공·실패 경로에서 document/object/stream memory가 해제되는지 검증한다.
- [ ] LuaHBTeX build metadata와 link line에서 `pplib`를 제거한다.
- [ ] `graphicx`, `pdfpages`, TikZ PDF import differential test를 통과한다.
- [ ] `pdfe`와 `pdfscanner` fixture parity test를 통과한다.

### E. TeX Live patch와 재현 빌드

- [x] `wasm-build/patches/texlive-wtpdf.patch`를 XeTeX 범위의 최소 변경으로 작성한다. LuaHBTeX 전환은 후속 patch 확장으로 남아 있다.
- [x] 빌드가 patch 전 `git apply --check` 실패 시 즉시 중단되게 한다.
- [x] configure/automake 입력 변경 후 `reautoconf` 재생성 절차를 고정한다.
- [x] Dockerfile과 Makefile이 고정 Xpdf를 재현 가능하게 빌드하도록 한다. XeTeX 원격 build에서 TeX Live Xpdf 4.04 archive 생성을 확인했다.
- [x] Phase 1 native build가 `pplib` 없이 native XeTeX와 필요한 code-generation tool을 만들도록 한다. `2c53a86` 원격 빌드에서 각 필수 출력을 fail-loud 검사했다.
- [x] XeTeX build script에서 `libpplib.a`를 제거한다.
- [ ] LuaHBTeX build script에서 `libpplib.a`를 제거한다.
- [x] XeTeX final link map과 JS/WASM에 `pplib` archive 또는 symbol이 없음을 자동 검사한다.
- [ ] LuaHBTeX final link map과 JS/WASM에 `pplib` archive 또는 symbol이 없음을 자동 검사한다.
- [x] XeTeX build가 자체 생성 PDF의 deterministic XDV golden hash를 artifact 추출 전에 검사한다.
- [ ] 대응 소스 archive에 `libs/pplib`가 없음을 자동 검사한다.
- [ ] 네트워크가 제한된 깨끗한 builder에서 source archive만으로 동일 release를 재빌드한다.
- [ ] 재빌드 산출물과 release artifact의 hash 또는 차이 원인을 기록한다.
- [x] TeX Live 연도 업그레이드 CI에서 patch drift를 감지한다. `texlive-source.ref` 또는 patch 변경이 XeTeX workflow를 실행하고 exact `git apply --check`를 거친다.

### F. 호환성·보안·성능 gate

- [x] `pplib` 기준 빌드와 WTPDF 후보 빌드를 같은 TeX Live revision과 같은 XeTeX initialization mode로 만든다. 기준 바이너리는 비교에만 사용하고 배포하지 않는다.
- [ ] PDF parser corpus의 출처·라이선스·기대 결과를 기록한다.
- [x] 자체 생성 classic-xref fixture의 page selection boundary, page size, box fallback, rotation과 XeTeX inclusion geometry 비교를 자동화한다.
- [x] 비배포 기준 이미지와 후보를 같은 xdvipdfmx 및 `pdftoppm` 144 DPI로 실행하는 11페이지 raster byte diff를 자동화한다.
- [ ] text와 위치 비교를 자동화한다.
- [ ] 두 개 이상의 PDF 구조 검사기로 결과를 검증한다.
- [ ] `pdfe`와 `pdfscanner` 결과를 JSON fixture로 비교한다.
- [ ] 브라우저와 Node의 cross-host parity를 검증한다.
- [ ] malformed, deeply nested, oversized PDF의 timeout과 memory limit을 검증한다.
- [ ] 암호화 PDF의 정상/오류 경로를 검증한다.
- [ ] WASM/JS size budget을 정의하고 통과한다.
- [ ] cold start, compile time, peak memory budget을 정의하고 통과한다.
- [ ] 모든 차이를 expected, approved, regression 중 하나로 분류하고 reviewer를 기록한다.
- [ ] production artifact에 `pplib` fallback이나 runtime switch가 없음을 확인한다.

### G. 엔진 라이선스 배포물

- [x] Cortex가 실제로 import하는 WasmTex 코드와 Worker protocol 경계를 확정한다. Cortex commit `53010b8808aec59fab99545aa9e6cbdf8eb3e265`에서 headless/LSP/Monaco/warmup runtime을 client build에 직접 import하는 것을 확인했다.
- [x] Cortex 비공개 목표를 기준으로 WasmTex 원저작 SDK의 라이선스를 결정한다. 현재 결합 방식에서는 host SDK를 MIT로 유지하고 engine release에 별도 상위 라이선스를 적용한다.
- [x] WasmTex 원저작 코드, 공개 engine code, generated artifact와 제3자 자료의 라이선스 범위를 파일·디렉터리 단위로 정한다. 기준 표는 `docs/licensing.md`에 둔다.
- [ ] 선택한 구조를 루트 `LICENSE`, README, 파일별 SPDX, `LICENSES/`와 manifest에 일관되게 명시한다.
- [ ] WasmTex 원저작 코드를 GPL로 선택한다면 Cortex가 해당 코드를 main bundle에 직접 import/link하지 않는지 별도 검토한다.
- [ ] pdfTeX, XeTeX/dvipdfmx, LuaHBTeX 각각의 최종 결합물 라이선스를 확정한다.
- [ ] Emscripten 및 ports의 license text와 copyright notice를 수집한다.
- [ ] LGPL 정적 링크가 있는 구성요소별 relink 준수 방식을 구현한다.
- [ ] SyncTeX port의 원 저작권·허가문을 소스와 notices에 보존한다.
- [ ] makeindex의 특별 배포/source 문구를 반영한다.
- [ ] TeX Live 패키지·폰트·Lua·포맷·ICU 파일별 provenance manifest를 생성한다.
- [ ] 라이선스 미확인 CDN 파일이 production allowlist에 들어오지 못하게 한다.
- [ ] 엔진별 `LICENSE-MANIFEST.json`에 source URL, commit, hash, license, notice 경로를 기록한다.
- [ ] 완전한 대응 소스 archive를 engine release와 같은 기간 동안 안정적으로 호스팅한다.
- [ ] artifact, manifest, source archive에 동일 release ID를 넣는다.
- [ ] 브라우저 UI에서 licenses/notices/source로 가는 링크를 제공한다.
- [ ] `THIRD_PARTY_NOTICES.md`, `docs/licensing.md`, `docs/proprietary-integration.md`를 최종 산출물에 맞게 갱신한다.

### H. Cortex 공개/비공개 경계

- [ ] 공개 엔진 Worker의 source와 build를 Cortex proprietary source tree에서 독립된 배포 단위로 만든다.
- [ ] Worker message protocol을 versioned public schema로 문서화한다.
- [ ] Cortex main bundle이 Emscripten 생성 GPL module을 직접 import하지 않게 한다.
- [ ] Cortex와 엔진이 pointer, shared runtime object 또는 engine-internal object graph를 교환하지 않게 한다.
- [ ] protocol payload를 file bytes, compile command, diagnostics, logs, output files 같은 일반 데이터로 제한한다.
- [ ] Cortex app과 engine Worker를 별도 build job, artifact manifest, cache namespace로 배포한다.
- [ ] source map과 production bundle을 검사해 GPL engine code가 Cortex app chunk에 섞이지 않았는지 확인한다.
- [ ] 공개 엔진만으로 제3자 host가 Worker를 실행할 수 있는 integration example을 제공한다.
- [ ] Cortex의 인증·협업·결제·저장·AI·서버 코드가 엔진 대응 소스에 필요하지 않은 독립 코드인지 architecture review한다.
- [ ] Cortex 이용약관이 GPL 및 기타 OSS 권리를 제한하지 않도록 예외를 둔다.
- [ ] 제품의 open-source notices 화면에 엔진 라이선스와 source 링크를 노출한다.
- [ ] 실제 production bundle, Worker 경계, protocol, 약관을 오픈 소스 전문 변호사에게 함께 검토받는다.

### I. FastLaTeX에서 WasmTex로 이전

- [ ] Cortex가 현재 로드하는 FastLaTeX engine, glue, data asset의 URL과 hash를 inventory한다.
- [ ] 기존 FastLaTeX asset에 대응 source/notice가 없는 기간의 배포 위험을 별도로 검토한다.
- [ ] license-cleared WasmTex release가 나오기 전에는 이름만 바꾼 동일 `pplib` 엔진을 해결책으로 배포하지 않는다.
- [ ] Cortex adapter를 공개 Worker protocol 소비자로 전환한다.
- [ ] pdfLaTeX, XeLaTeX, LuaLaTeX의 기능·성능·오류 메시지를 이전 버전과 비교한다.
- [ ] 프로젝트 파일, cached format, compile option의 migration compatibility를 검증한다.
- [ ] FastLaTeX asset과 fallback을 production build에서 제거한다.
- [ ] 제거 후 network trace와 bundle scan으로 FastLaTeX URL 또는 code가 남지 않았음을 확인한다.
- [ ] rollback은 license-cleared WasmTex 이전 release만 가리키도록 한다.

### J. 최종 릴리스 승인

- [ ] `pplib` 명시적 라이선스를 확보했거나, 모든 공개 배포물에서 `pplib`를 완전히 제거했다.
- [ ] `complete-corresponding-source` 차단 사유를 실제 재현 빌드 증거로 해소했다.
- [ ] `texlive-provenance` 차단 사유를 파일별 manifest와 allowlist로 해소했다.
- [ ] `pplib-license-evidence` 차단 사유의 해소 근거를 manifest에 연결했다.
- [x] `LICENSE-MANIFEST.json`과 source repository 정책을 자동 검증하는 CI를 모든 engine workflow에 연결한다. `npm run check:licenses`가 현재 source mode에서 통과한다.
- [x] public repository의 engine workflow가 artifact 생성·업로드 전에 strict `--release` gate를 실행한다. 현재 `development-only` manifest는 의도대로 거부된다.
- [ ] 보안·호환성·성능 gate가 통과했다.
- [ ] 법률 검토 의견과 engineering evidence 사이의 미해결 항목이 없다.
- [ ] release approver가 엔진 artifact, source archive, notices, Cortex boundary를 최종 확인했다.
- [ ] 공개 후 source URL과 notices URL이 실제로 접근 가능하고 artifact release ID와 일치한다.

### K. Git 이력과 GitHub 공개

로컬 `git init`과 로컬 commit은 그 자체로 제3자에게 배포하는 행위가 아니다. 그러나 이 저장소의 전체 이력을 나중에 공개할 계획이라면, 최초 commit부터 공개 가능한 내용만 기록해야 한다. 삭제한 파일도 과거 commit에는 남으며 공개 push 후에는 fork와 clone에서 회수할 수 없기 때문이다.

라이선스 해결 작업을 모두 마칠 때까지 Git 사용을 미룰 필요는 없다. 원저작 source, build recipe, 테스트, 라이선스 조사 문서와 `development-only` manifest는 먼저 commit할 수 있다. 반면 라이선스가 정리되지 않은 제3자 source, complete corresponding source가 준비되지 않은 engine binary와 format, CDN mirror, 비밀값은 어떤 중간 commit에도 넣지 않는다.

- [x] `.env`, `.env.*`, `.DS_Store`, 로컬 agent/browser 상태를 `.gitignore`로 제외한다.
- [x] `public/wasmtex/<version>/`에서는 검토된 compliance manifest만 추적하고 WASM, glue, Worker, format, ICU data를 제외한다.
- [x] `wasm-build/dist*/`, 루트 `dist/`, `bin/`, test output과 cache를 추적하지 않는다.
- [x] 최초 staging 전에 `git status --ignored`로 제외 규칙을 검토한다.
- [ ] 최초 staging 전에 secret scanner를 실행하고 결과를 보존한다.
- [ ] 최초 staging 대상에서 대용량 binary와 archive를 별도로 검토한다.
- [ ] 제3자에서 복사·포팅한 모든 source 파일에 provenance와 적용 notice가 있는지 확인한다.
- [ ] `pplib` header, source, binary 또는 그 표현을 복사한 compatibility shim을 어떤 commit에도 넣지 않는다.
- [x] engine workflow는 대응 소스와 manifest가 준비되지 않은 public repository에서 Actions artifact 생성·업로드를 strict gate로 차단하며, 같은 정책을 GitHub Releases에도 적용한다.
- [ ] GitHub 공개 전 `git rev-list --objects --all`을 기준으로 전체 이력의 secret, binary, 제3자 provenance를 다시 검사한다.
- [ ] 공개 전 license scanner와 SBOM 생성을 CI에 추가하고 미확인 라이선스를 fail-closed 처리한다.
- [ ] 공개 전 branch, tag, stash 및 Git LFS object까지 포함해 제거 대상이 과거 이력에 없는지 확인한다.
- [ ] GitHub 원격 저장소는 공개 gate가 통과할 때까지 만들지 않거나 private으로 유지한다.
- [ ] history rewrite가 필요해지면 public push 전에 수행하고, rewrite 후 모든 object를 다시 감사한다.
- [ ] 공개 source 저장소와 별도로 배포되는 engine/CDN release가 자체 라이선스 gate를 통과하는지 확인한다.

## 10. 중단 조건

다음 중 하나라도 해당하면 XeLaTeX/LuaLaTeX production 배포를 중단한다.

- 최종 또는 중간 link artifact에 `pplib`가 남아 있다.
- `pplib` 사용 권리의 범위가 상업적 WASM 재배포와 downstream 수정·재배포를 포함하지 않는다.
- 공개 source archive만으로 배포 엔진을 재빌드할 수 없다.
- TeX Live CDN 파일의 출처·라이선스를 확인하지 못했다.
- Lua `pdfe`/`pdfscanner` 회귀가 있는데도 호환 변경으로 문서화·versioning하지 않았다.
- Cortex main bundle에 엔진 생성 코드가 직접 결합되어 있는데 그 법적 효과를 검토하지 않았다.
- 제품 약관이나 기술적 제한이 사용자의 GPL 권리와 충돌한다.
- manifest의 차단 사유를 증거 없이 수동으로 제거했다.

pdfLaTeX는 별도 manifest와 대응 소스가 완전하고, 해당 artifact에 `pplib`가 포함되지 않는다는 것이 입증되면 XeLaTeX/LuaLaTeX와 독립적으로 release 가능하다. 다만 제품 UI는 사용할 수 없는 엔진을 명확히 표시하고 미승인 엔진 asset을 prefetch하지 않아야 한다.

## 11. 참고 자료

프로젝트 내부 문서:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/execution-model.md`](docs/execution-model.md)
- [`docs/engine.md`](docs/engine.md)
- [`docs/texlive-upgrade.md`](docs/texlive-upgrade.md)
- [`docs/licensing.md`](docs/licensing.md)
- [`docs/proprietary-integration.md`](docs/proprietary-integration.md)
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`public/wasmtex/2025/LICENSE-MANIFEST.json`](public/wasmtex/2025/LICENSE-MANIFEST.json)
- [`wasm-build/texlive-source.ref`](wasm-build/texlive-source.ref)

상위 자료:

- TeX Live copying conditions: <https://www.tug.org/texlive/copying.html>
- TeX Live package contribution license policy: <https://tug.org/texlive/pkgcontrib.html>
- `pplib` public repository: <https://github.com/contextgarden/pplib>
- GNU GPL v2: <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>
- GNU GPL FAQ의 결합/aggregation 설명: <https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation>
- 고정 TeX Live source와 그 안의 Xpdf `README`, `COPYING` 및 각 엔진 license file

외부 웹 자료는 나중에 내용이 바뀔 수 있다. 릴리스 증거에는 URL만 저장하지 말고 검토한 정확한 commit 또는 archive와 license 원문 hash를 함께 보존한다.
