import type { ActivityItem } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { activityGroup, describeActivity } from "./activity.ts";

function item(action: string, meta: ActivityItem["meta"] = null, actorId = "u2"): ActivityItem {
  return {
    id: "a",
    actorId,
    actorName: "Ana Souza",
    action,
    entity: "contract",
    entityId: "c",
    meta,
    at: "",
  };
}

describe("describeActivity", () => {
  it("says whether the invite went by e-mail", () => {
    expect(describeActivity(item("contract.invite_sent", { email: true }), "u1").text).toBe(
      "mandou o convite por e-mail",
    );
    expect(describeActivity(item("contract.invite_sent", { email: false }), "u1").text).toBe(
      "gerou um código de convite",
    );
  });

  it("covers removal and restore", () => {
    expect(describeActivity(item("contract.archive"), "u1")).toMatchObject({
      text: "removeu o vínculo",
      tone: "alert",
    });
    expect(describeActivity(item("contract.restore"), "u2")).toMatchObject({
      actor: "Você",
      tone: "ok",
    });
  });

  it("survives missing meta and unknown actions", () => {
    expect(describeActivity(item("payment.create"), "u1").value).toBeUndefined();
    expect(
      describeActivity({ ...item("whatever"), actorName: null, actorId: null }, "u1"),
    ).toMatchObject({
      actor: "Alguém",
      text: "fez uma alteração",
    });
  });
});

describe("activityGroup", () => {
  it("buckets actions for the history filter", () => {
    expect(activityGroup("entry.clock_in")).toBe("registros");
    expect(activityGroup("payment.acknowledge")).toBe("pagamentos");
    expect(activityGroup("adjustment.create")).toBe("pagamentos");
    expect(activityGroup("contract.invite_sent")).toBe("vinculo");
    expect(activityGroup("contract.archive")).toBe("vinculo");
  });
});
