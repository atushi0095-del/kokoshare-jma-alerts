# ここシェア 気象通知ワーカー

アプリ本体とは別の、小さな **公開GitHubリポジトリ** として利用します。
このフォルダの中身だけを公開します。アプリ本体、署名鍵、google-services.json、サービスアカウント鍵を含めないでください。

## 構成と費用

- 気象庁の公式XML -> GitHub Actionsの標準ubuntu-latest -> Firebase Cloud Messagingの地域トピック。
- Sparkプラン。Auth、Firestore、Realtime Database、Cloud Functions、Cloud Run、Billing accountは不要です。
- 公開リポジトリの標準GitHub-hosted runnerを使用。Privateリポジトリではworkflowを実行しない条件を付けています。
- 有料runner、追加キャッシュ容量、GitHub有料従量課金を有効にしないでください。上限・障害時は配信が遅延/停止します。
- 無制限の提供や将来の価格を保証する構成ではありません。料金・利用条件変更時は通知を止め、端末での確認に切り替えられます。
- ユーザーごとのDB・位置履歴・健康情報は扱いません。state.jsonは公開気象情報と未送信の公開警報だけです。

## 外部設定（未実施）

1. FirebaseのSparkプロジェクトへAndroidアプリ `com.ajuworks.kokoshare` を登録します。Firestore等の作成は不要です。
2. 取得した設定ファイルをアプリ本体の `android/app/google-services.json` に置きます。古い `jp.anpinote.app` の設定は使いません。
3. Firebase Cloud Messaging API (HTTP v1)を有効にします。課金設定を要求された場合は進めず、設定内容を確認してください。
4. FCM送信用の専用サービスアカウントを作り、対象プロジェクトの `Firebase Cloud Messaging API Admin` ロールだけを付与します。Owner/Editorを付けません。
5. このフォルダの中身だけでpublicリポジトリを作成します。default branchへ `.github/workflows/jma.yml`、package-lock.json、fixtures等を含めます。`node_modules`、fetch-cache.json、outbox.jsonは含めません。初回はstate.jsonも含めません。
6. GitHub Settings -> Secrets and variables -> Actions に `FCM_SERVICE_ACCOUNT` を登録し、サービスアカウントJSON全文を値に設定します。鍵はログ・ソース・APK/AABに入れません。
7. Actionsの書き込み権限を有効にします。state.jsonのcommit/pushが許可されるようbranch protectionを確認します。
8. `JMA public alerts` を手動実行します。初回は現在状態を保存し、過去の警報を一斉送信しません。
9. Androidアプリを再ビルドします。端末で地域を選び、説明を読んで通知ON・OS許可を選びます。
10. テスト端末で、テスト用と明記したFCM dataメッセージを用い、新規/解除/地域変更/OFF/通知タップを確認してください。一般利用者のトピックへテスト警報を配信しないでください。

設定ファイルを入れる前のAABは、警報の直接取得・日常共有・端末内メモを利用できますが、プッシュ通知を有効にできません。画面には「配信設定は準備中」と表示します。

## ローカル検証

```sh
npm ci --ignore-scripts
npm test
node worker.mjs
# 実際に通知する場合のみ（認証設定必須）:
node worker.mjs --send
```

`node worker.mjs` は公開データ取得と状態保存だけです。秘密鍵なしで検証できます。

## 対象と重複防止

- VPWW53（従来体系）、VPWW55（大雨）、VPWW58（暴風・暴風雪）、VPWW60（大雪）を扱います。洪水警報は従来体系に現れる名称を扱います。新体系の指定河川洪水予報・氾濫情報は対象外です。公式ページへ誘導し、すべての災害情報を網羅すると表示しません。
- 特別警報/警報/注意報を区別。注意報はアプリで初期OFF。
- 通常電文だけを処理し、訓練・未知の警報名称は通知しません。XMLのDTD/外部ENTITYは拒否します。
- 地域・現象単位で発表時刻を比較し、継続更新だけでは通知しません。新規、格上げ、格下げ、解除を処理します。
- 初回は現在状態のみ保存。中断後の古い変化は最新状態にまとめ、24時間を超える未送信分は捨てます。
- stateを先にcommitしてから送信し、成功した分を取り除きます。途中で失敗した分は次回に再試行します。端末もeventIdで重複抑制します。ネットワーク境界の完全な一度だけ配信は保証しません。
- 同じ状態ではcommitしません。送信成功・期限切れによるpendingの変更は実際の状態変更としてcommitします。
- concurrencyで重複実行を抑止。取得済みXMLはGitHub Actions cacheで再利用し、毎回同じ電文をダウンロードしません。cache消失時には再取得します。
- ログは件数とエラーのみ。認証鍵やアクセストークンを出力しません。

## 運用上の限界

- 5分周期は実行希望時刻で、配信保証ではありません。GitHubの混雑で遅延・取りこぼしがあります。
- 公開リポジトリは60日間活動がないとscheduleが自動無効化される場合があります。**scheduled workflowが有効か定期確認してください。** ダミーcommitで回避しません。
- FCMのtopicは公開情報向けで、緊急速報の速度・到達を保証しません。normal priorityなのでDoze等で遅れます。アプリ強制停止・OS通知OFF・通信不可の場合も届かないことがあります。
- 原本電文が欠ける、解析できない場合は処理を失敗にし、保存済み状態を「安全」と置き換えません。Actionsの失敗通知を有効にしてください。
- GitHubやFCMの障害時も、アプリ内の手動更新・気象庁リンクを利用できます。アプリは起動/画面表示時にキャッシュを確認し、最短15分間隔で地域分だけを取得します。バックグラウンドGPS/定期ポーリングはしません。

## 公式根拠・データ出典

- [気象庁 XML公開](https://xml.kishou.go.jp/xmlpull.html)
- [2026年体系の技術情報](https://www.jma.go.jp/jma/kishou/know/bosai/keiho-update2026/tech-info/index.html)
- fixturesは気象庁公開の2026年大雨タイムラインサンプルをそのまま収録。
- [GitHub scheduleの制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actionsの料金](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [FCM topicの性質](https://firebase.google.com/docs/cloud-messaging/topic-messaging)
- [Firebase Androidのデータ開示](https://firebase.google.com/docs/android/play-data-disclosure)
