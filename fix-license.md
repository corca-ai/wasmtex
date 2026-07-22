# WasmTex 라이선스 정리 체크리스트

상태: 진행 중

대상: 이 저장소와 이 저장소에서 공개하는 SDK·엔진 배포물

> 이 문서는 기술적 라이선스 준수 계획이며 법률 자문이 아니다. 실제 상용
> 배포 전에는 최종 바이너리, 대응 소스와 고지를 오픈 소스 전문 변호사에게
> 검토받는다.

## 1. 이번 계획의 범위

목표는 WasmTex 소스 저장소를 공개하고, 브라우저에서 pdfLaTeX, XeLaTeX와
LuaLaTeX를 제공하는 엔진 배포물도 각 라이선스를 지키며 공개하는 것이다.

이번 체크리스트에는 **이 저장소에서 할 일만** 포함한다.

- 다른 애플리케이션 저장소의 코드, 번들, 약관과 배포 설정은 검사하거나
  수정하지 않는다.
- FastLaTeX 제거와 제품 통합 전환은 이 체크리스트에 포함하지 않는다.
- 별도로 운영 중인 **TeX Live 2025 전체 패키지 CDN**은 완료된 외부 배포
  전제로 두고, 패키지 4,110개의 수동 재검토, package override 작성,
  CDN object별 provenance 대조를 WasmTex 엔진 릴리스 차단 조건으로 두지
  않는다.
- 다만 엔진을 빌드하는 데 사용한 고정 TeX Live **source**, 생성 포맷의
  입력, ICU 데이터와 실제 링크된 라이브러리의 라이선스·대응 소스 의무는
  이 저장소의 엔진 릴리스 범위에 계속 포함한다.

WasmTex가 직접 작성한 SDK는 현재 MIT로 유지한다. 엔진 Worker, Emscripten
glue, WASM과 포맷은 npm 패키지의 MIT 표지만으로 배포하지 않고, 실제로
결합된 GPL·LGPL·LPPL·permissive 조건과 구성요소별 고지를 적용한다.

## 2. 현재 상태

| 항목 | 상태 | 의미 |
| --- | --- | --- |
| Git 저장소 | 진행 가능 | 로컬 저장소와 커밋 이력이 있고 원격 저장소는 없다. |
| SDK 라이선스 | 결정됨 | WasmTex 원저작 host SDK는 MIT로 유지한다. |
| `pplib` | 새 소스에서 제거됨 | XeTeX/LuaHBTeX가 WTPDF/Xpdf를 사용하고 독립 SHA-2 구현을 사용한다. |
| WTPDF 증거 빌드 | 통과 | native/WASM smoke, link map과 byte scan 증거가 저장되어 있다. |
| 대응 소스 도구 | 구현됨 | build receipt 기반 source archive builder/checker가 있다. |
| 새 릴리스 후보 바이너리 | 완료 (`2b58db3`) | D 단계가 찾은 WTPDF 결함 두 건을 수정한 뒤 여섯 family 모두 단일 source `2b58db3`로 재빌드해 receipt·link inventory·SBOM에 다시 묶었다. 변경 없는 네 family는 byte 단위로 재현되었고 XeTeX/LuaHBTeX만 수정 범위만큼 바뀌었다. |
| 최종 대응 소스 archive | 없음 | 새 release receipt로 실제 archive를 만들고 재빌드해야 한다. |
| 최종 notices/relink 자료 | 완료 | archive 81개를 구성요소 inventory로 분류하고 GPL 선택, 고지, SPDX SBOM과 complete-source relink 절차를 검사한다. 실제 source archive 생성은 F 단계다. |
| 호환성·보안 승인 | 미완료 | 특히 LuaHBTeX PDF API와 비정상 PDF 검증이 남아 있다. |
| 엔진 매니페스트 | `development-only` | fresh artifact 차단은 해소했지만 나머지 네 차단 항목이 끝나기 전에는 공개 바이너리를 배포하지 않는다. |

새 WTPDF 구현의 주요 증거는 다음 문서에 있다.

- [`docs/license-evidence/xetex-wtpdf-23f2ce1.md`](docs/license-evidence/xetex-wtpdf-23f2ce1.md)
- [`docs/license-evidence/xetex-geometry-differential-aa23fbb.md`](docs/license-evidence/xetex-geometry-differential-aa23fbb.md)
- [`docs/license-evidence/xetex-visual-differential-77fef0c.md`](docs/license-evidence/xetex-visual-differential-77fef0c.md)
- [`docs/license-evidence/xetex-pdf-extended-differential-2d87107.md`](docs/license-evidence/xetex-pdf-extended-differential-2d87107.md)
- [`docs/license-evidence/luahbtex-wtpdf-666663b.md`](docs/license-evidence/luahbtex-wtpdf-666663b.md)
- [`docs/license-evidence/luahbtex-pdfe-differential-923b196.md`](docs/license-evidence/luahbtex-pdfe-differential-923b196.md)
- [`docs/license-evidence/wtpdf-v2-63c9303.md`](docs/license-evidence/wtpdf-v2-63c9303.md)
- [`docs/license-evidence/engine-release-2025-2b58db3.md`](docs/license-evidence/engine-release-2025-2b58db3.md)

## 3. 공개 단위와 적용 조건

| 공개 단위 | 처리 |
| --- | --- |
| npm SDK, UI, LSP, WasmTex 문서·glue 원본 | MIT. `package.json`의 배포 파일 목록에서 엔진 바이너리를 제외한다. |
| SyncTeX TypeScript port | MIT SDK와 함께 배포하되 원 저작권, 허가문과 non-endorsement 고지를 보존한다. |
| pdfTeX Worker/JS/WASM | Xpdf 4.04의 GPLv2 선택 때문에 이 결합물은 GPL-2.0-only로 배포하고 정확한 대응 소스를 제공한다. |
| XeTeX Worker/JS/WASM | Xpdf와 FreeType을 GPL-2.0-only로 선택하고 XeTeX 고지를 함께 적용한다. |
| dvipdfmx Worker/JS/WASM | GPL-2.0-or-later 결합물로 취급한다. |
| LuaHBTeX Worker/JS/WASM | Xpdf 4.04의 GPLv2 선택 때문에 이 결합물은 GPL-2.0-only로 배포한다. |
| BibTeX/BibTeX8/makeindex | 각 원본 고지, kpathsea 등 링크 라이브러리 조건과 makeindex의 특별 문구를 적용한다. |
| `.fmt`/`.fmt.gz`, ICU 데이터 | 생성 입력과 ICU 68.2의 원래 조건·고지를 적용한다. |
| Monaco, PDF.js, pdf-lib | WasmTex npm 배포에 byte를 복제하지 않는 peer다. 데모에 실제 번들되면 데모 산출물에 고지를 포함한다. |

## 4. 실행 체크리스트

완료 표시는 문서가 있다는 이유만으로 하지 않는다. 해당 release byte와
직접 연결된 증거가 있어야 완료다.

### A. 범위와 라이선스 기준

- [x] WasmTex 원저작 SDK를 MIT로 유지하고 엔진 배포물과 적용 범위를 분리했다.
- [x] pdfTeX, XeTeX/dvipdfmx, LuaHBTeX, BibTeX/BibTeX8와 makeindex를 별도 artifact family로 분류했다.
- [x] TeX Live source를 commit `143f1723353b20202645f241db429b080a8adcdf`로 고정했다.
- [x] Emscripten 3.1.46 base image, Emscripten commit과 FreeType·ICU·libpng·zlib port archive를 hash로 고정했다.
- [x] 새 공개 빌드에서는 `pplib` 대신 독립 WTPDF/Xpdf 경로를 사용하기로 확정했다.
- [x] TeX Live 2025 전체 패키지 CDN 점검을 이 엔진 릴리스 체크리스트와 차단 사유에서 제외했다.
- [ ] 최종 공개 범위가 루트 `LICENSE`, `README.md`, `package.json`, `LICENSES/`, `THIRD_PARTY_NOTICES.md`와 release manifest에서 같은 의미인지 마지막으로 대조한다.

### B. 과거 로컬 바이너리 격리

- [x] 추적 중인 `public/wasmtex/2025/LICENSE-MANIFEST.json`만 보존하고, 같은 디렉터리의 무시된 과거 `manifest.json`, JS, Worker, WASM과 format 파일을 저장소 밖으로 격리했다.
- [x] `wasm-build/dist/`, `wasm-build/dist-bibtex8/`, `wasm-build/dist-luatex/`, `wasm-build/dist-makeindex/`, `wasm-build/dist-xetex/`의 과거 산출물을 저장소 밖으로 격리했다.
- [x] 루트 `dist/`의 과거 데모·엔진 산출물을 저장소 밖으로 격리했다.
- [x] 정리 후 unavailable-engine 단위 테스트로 과거 바이너리 없이 명확한 오류 결과를 반환하는 경로를 확인했다.
- [x] `git status --ignored`와 `git ls-files`로 과거 바이너리가 추적되거나 공개 staging 대상에 들어가지 않음을 확인했다.

### C. 새 엔진 릴리스 빌드

- [x] release source commit `23ee539`과 고정 TeX Live source로 pdfTeX와 BibTeX를 새로 빌드한다.
- [x] 같은 입력으로 BibTeX8을 새로 빌드한다.
- [x] 같은 입력으로 makeindex를 새로 빌드한다.
- [x] WTPDF/Xpdf 경로로 XeTeX와 dvipdfmx를 새로 빌드한다.
- [x] WTPDF/Xpdf와 독립 SHA-2 경로로 LuaHBTeX를 새로 빌드한다.
- [x] 새 pdfLaTeX, XeLaTeX와 LuaLaTeX 바이너리에 맞는 `.fmt`와 `.fmt.gz`를 다시 생성한다.
- [x] Worker/controller, Emscripten module, WASM, format과 runtime helper를 하나의 release asset directory에 모은다.
- [x] 각 build family에 `BUILD-RECEIPT.<family>.json`을 생성하고 모든 파일이 정확히 한 receipt에만 속하게 한다.
- [x] 각 receipt가 WasmTex commit, TeX Live commit, Emscripten commit, Docker image digest와 파일 SHA-256을 기록하는지 검증한다.
- [x] 최종 link map, archive, JS와 WASM byte scan에서 `libpplib.a`, `ppdoc_`, `ppdict_`, `pparray_`, `ppstream_`, `ppref_`와 legacy SHA helper가 없음을 확인한다.
- [x] 최종 artifact의 실제 link inventory를 생성하고 `LICENSE-MANIFEST.json`의 family 분류와 대조한다.

### D. WTPDF 호환성·보안·성능

- [x] XeTeX의 classic-xref page selection, page box, rotation과 XDV geometry differential test를 통과했다.
- [x] XeTeX 자체 생성 vector corpus 11페이지의 고정 renderer visual differential test를 통과했다.
- [x] LuaHBTeX caller를 WTPDF API로 전환하고 native/Emscripten compile 및 기본 smoke를 통과했다.
- [x] xref stream, object stream, 암호화·손상 PDF와 실제 문서를 포함한 XeTeX 확장 corpus를 통과한다. pplib 기준선과 clean JSON, XDV, xdvipdfmx PDF, 144dpi 래스터와 실제 문서 XDV가 byte 단위로 일치한다.
- [x] LuaHBTeX의 classic xref, xref stream과 object stream 동작을 fixture로 검증한다. pdfe 차등 비교와 repeat-image 빌드 게이트가 두 xref 배치 모두를 검증한다.
- [ ] `graphicx`, `pdfpages`와 TikZ PDF import를 기준 빌드와 비교한다.
- [x] `pdfe`와 `pdfscanner`의 반환 type, string byte, dictionary 순서, raw/decoded stream과 오류를 JSON fixture로 비교한다. pplib 기준선과 클린 입력 동작이 byte 단위로 일치했고, 손상 PDF 복구 차이는 승인해 expected fixture로 잠갔다.
- [x] post-open 인증과 잘못된 password의 기존 `pdfe` 계약을 구현·검증한다. 잠긴 상태, 잘못된 password 거부, user password 해제가 기준선과 일치한다.
- [ ] malformed, deeply nested와 oversized PDF의 timeout, allocation limit과 실패 동작을 검증한다.
- [x] 성공·실패 경로의 document/object/stream memory 해제를 검증한다. pdfe 프로브는 valgrind 무손실이고, 이미지 포함 경로의 잔여 누수는 pplib 기준선과 총량이 동일한 업스트림 kpathsea/종료 경로다.
- [ ] PDF 출력의 text와 위치를 자동 비교하고 두 개 이상의 PDF 구조 검사기로 결과를 검사한다.
- [ ] 브라우저와 Node host에서 pdfLaTeX, XeLaTeX, LuaLaTeX와 BibTeX 결과 parity를 검증한다.
- [x] WASM/JS 크기, cold start, compile time과 peak memory budget을 정하고 통과한다. 실측(`engine-performance-2b58db3.json`)으로 RSS budget을 보정했고 크기·런타임 검사가 통과한다.
- [ ] 발견한 차이를 `expected`, `approved`, `regression`으로 분류하고 승인자를 기록한다.
- [ ] production artifact에 `pplib` fallback이나 runtime switch가 없음을 확인한다.

### E. 라이선스 원문·고지·relink 자료

- [x] GPL-2.0, GPL-3.0, LGPL-2.0/2.1, Xpdf 4.04, XeTeX, SyncTeX와 makeindex의 현재 원문·고지 파일을 `LICENSES/`에 두었다.
- [x] SyncTeX port source header가 원 저작자와 `LICENSES/SyncTeX.txt`를 가리키도록 했다.
- [x] ICU 68.2, Emscripten 3.1.46와 현재 알려진 ports/linked library 고지를 저장했다.
- [x] 새 최종 link inventory를 기준으로 빠진 library, version, copyright와 license text가 없는지 다시 조사한다.
- [x] pdfTeX, XeTeX/dvipdfmx와 LuaHBTeX 결합물별로 사용할 GPL 선택과 호환성을 최종 확정한다.
- [x] 정적으로 링크된 LGPL 구성요소마다 사용하는 라이선스 선택지를 기록하고, complete-source relink 방식과 `RELINK.md` 생성·검사 절차를 구현한다. 실제 자료를 담은 archive 생성·재빌드는 F 단계에서 검증한다.
- [x] makeindex 배포물에 수정된 port임을 밝히고 소스를 얻는 방법을 눈에 띄게 적는다.
- [x] 생성된 Emscripten JavaScript에서 보존해야 할 license output과 copyright notice가 minify/build 후에도 남는지 확인한다.
- [x] `.fmt` 파일의 정확한 관측 입력과 생성 절차를 release evidence에 기록하고, 재생성 byte의 알려진 비결정성도 명시한다.
- [x] `THIRD_PARTY_NOTICES.md`와 `LICENSES/README.md`를 최종 artifact inventory에 맞춰 갱신한다.
- [x] npm package와 standalone demo 각각에 실제 포함된 peer dependency notice를 확인한다.
- [x] 최종 엔진 배포물의 SPDX SBOM과 machine-readable license inventory를 생성한다.

### F. 완전한 대응 소스

- [x] build receipt에 묶인 deterministic corresponding-source builder/checker를 구현했다.
- [x] source archive가 사용하지 않는 `libs/pplib`를 포함하면 실패하도록 했다.
- [x] source archive 입력에 WasmTex source, 고정 TeX Live source, Emscripten source, ports archive, patch, Dockerfile, build script와 glue를 포함하도록 했다.
- [ ] C 단계에서 만든 **실제 최종 receipt**로 corresponding-source archive를 생성한다.
- [ ] archive의 `REBUILD.md`, `SOURCE-MANIFEST.json`, license manifest와 receipt가 최종 release ID를 가리키는지 확인한다.
- [ ] 네트워크가 제한된 깨끗한 Linux builder에서 archive만으로 모든 engine family와 format을 재빌드한다.
- [ ] 재빌드 byte를 release artifact와 비교하고, hash가 다르면 재현 가능한 차이 원인과 승인 결과를 기록한다.
- [ ] source archive의 SHA-256을 계산하고 엔진 release와 같은 기간 동안 유지할 공개 HTTPS URL을 정한다.
- [ ] 공개 URL과 SHA-256을 `LICENSE-MANIFEST.json`의 `correspondingSource`에 기록한다.

### G. 릴리스 매니페스트와 자동 차단

- [x] source mode의 `npm run check:licenses`가 미승인 바이너리 추적, `pplib` 재도입과 manifest 불일치를 거부한다.
- [x] public workflow가 artifact 업로드와 Pages 배포 전에 strict release mode를 실행하도록 했다.
- [x] asset manifest가 파일별 receipt 누락·중복·hash 불일치와 license family 미분류를 거부한다.
- [x] `LICENSE-MANIFEST.json`의 artifact family와 distribution terms를 최종 link inventory에 맞춰 확정한다. `check:licenses`가 `link-inventory-2b58db3.json` 기준으로 family 분류·구성요소·SBOM 일치를 fail-closed로 검사한다.
- [x] `fresh-release-artifacts` 차단 사유를 새 receipt와 link inventory 증거로 해소한다.
- [x] `third-party-notices-and-relink` 차단 사유를 link inventory, 구성요소 inventory, notices, SPDX SBOM과 relink 절차 증거로 해소한다.
- [ ] `compatibility-security`, `complete-corresponding-source`, `public-repository-audit` 차단 사유를 각각 증거와 함께 해소한다.
- [ ] 모든 차단 사유가 해소된 뒤에만 `releaseStatus`를 `release-cleared`로 변경한다.
- [ ] `node scripts/gen-asset-manifest.mjs 2025 --release`가 최종 asset directory에서 통과하는지 확인한다.
- [ ] `npm run check:licenses -- --release`가 통과하는지 확인한다.
- [ ] 생성한 `manifest.json`, `LICENSE-MANIFEST.json`, receipt, notices와 source archive가 모두 같은 release ID와 hash를 가리키는지 확인한다.
- [ ] standalone demo에 현재 로드된 엔진의 license, notices와 source archive로 가는 링크를 제공한다.

### H. GitHub 공개 준비

- [x] 저장소를 초기화하고 라이선스 정리 작업을 작은 commit으로 기록하고 있다.
- [x] 생성 엔진, format, ICU data와 `dist*`를 Git 추적 대상에서 제외했다.
- [x] 내부 빌드 환경 식별자를 문서와 현재 Git object history에서 제거했다.
- [x] 공개 가능한 compliance manifest만 `public/wasmtex/<version>/`에서 추적한다.
- [x] B 단계의 무시된 과거 로컬 바이너리를 저장소 밖으로 격리한다.
- [ ] 현재 tree와 `git rev-list --objects --all` 전체 이력에 secret scanner를 실행하고 결과를 보존한다.
- [ ] 전체 이력의 대용량 blob, binary/archive와 제3자 source provenance를 감사한다.
- [ ] 제3자에서 복사·포팅한 모든 source header와 적용 notice를 확인한다.
- [ ] license scanner와 SBOM 생성을 CI에 추가하고 미확인 항목을 fail-closed 처리한다.
- [ ] branch, tag, stash와 Git LFS object를 포함해 공개하면 안 되는 파일이 없는지 확인한다.
- [ ] 공개 전까지 원격 저장소를 만들지 않거나 private으로 유지한다.
- [ ] 공개 직전에 `npm run check`, `npm run test:license-tools`와 source-mode license gate를 다시 실행한다.
- [ ] 모든 공개 준비 변경을 commit하고 worktree가 깨끗한지 확인한다.

## 5. 두 개의 공개 승인선

### 소스 저장소 공개

다음을 만족하면 엔진 바이너리 릴리스보다 먼저 GitHub source 저장소를 공개할
수 있다.

- [ ] H 단계의 history·secret·binary·provenance 감사를 통과했다.
- [ ] 저장소가 생성 engine byte나 uncleared third-party source를 추적하지 않는다.
- [ ] 루트 라이선스, third-party notices와 문서가 현재 source tree를 정확히 설명한다.
- [ ] `LICENSE-MANIFEST.json`이 계속 `development-only`이고 공개 바이너리 배포가 자동 차단된다.

### 엔진 바이너리 공개

다음을 모두 만족해야 브라우저에 새 engine JS/WASM/format을 전송할 수 있다.

- [ ] B부터 G까지의 미완료 항목을 모두 해소했다.
- [ ] 모든 최종 artifact가 새 receipt에 묶이고 `pplib` 흔적이 없다.
- [ ] 모든 GPL/LGPL/구성요소별 고지와 relink 자료가 준비되었다.
- [ ] 완전한 대응 소스 archive가 실제 배포 byte에 연결되어 공개되었다.
- [ ] 호환성·보안·성능 gate를 통과했다.
- [ ] 오픈 소스 전문 법률 검토의 미해결 사항이 없다.
- [ ] 공개 URL의 artifact, notices와 source archive가 실제로 접근 가능하고 동일 release ID를 가리킨다.

## 6. 즉시 중단 조건

다음 중 하나라도 발견하면 엔진 공개를 중단한다.

- 최종 또는 중간 link artifact에 `pplib` 또는 legacy parser/SHA symbol이 남아 있다.
- 공개 source archive만으로 배포 엔진을 재빌드할 수 없다.
- 실제 link inventory에 라이선스나 재배포 근거가 확인되지 않은 구성요소가 있다.
- 필요한 LGPL 재링크 방법이나 구성요소별 고지가 빠져 있다.
- Lua `pdfe`/`pdfscanner` 또는 PDF import 회귀를 승인·문서화하지 않았다.
- 과거 로컬 바이너리가 새 release asset이나 데모 build에 섞였다.
- manifest의 차단 사유를 대응 증거 없이 지웠다.

## 7. 관련 문서

- [`docs/licensing.md`](docs/licensing.md)
- [`docs/corresponding-source.md`](docs/corresponding-source.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/execution-model.md`](docs/execution-model.md)
- [`docs/engine.md`](docs/engine.md)
- [`docs/texlive-upgrade.md`](docs/texlive-upgrade.md)
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`public/wasmtex/2025/LICENSE-MANIFEST.json`](public/wasmtex/2025/LICENSE-MANIFEST.json)
