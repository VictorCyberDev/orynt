// 3. A person approves, as themselves. `approverClient` is an OryntClient bound to that
//    person's own session; API keys cannot approve. The key never leaves their device.
const keys = generateKeyPair();       // illustration: in real use, load the approver's stored key pair.
                                      // Its public key is registered once via POST /v1/me/approval-key
const me = await approverClient.me();
const body = signApprovalBody(keys, submitted, me.user.id, me.workspace.id);
await approverClient.obligations.approve(draft.id, body);
