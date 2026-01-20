import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL } from "../constants/string";
import { Button, Card, List, message, Tag } from "antd";
import {
  ArrowLeftOutlined,
  UserOutlined,
  UserAddOutlined,   // 可选：用于表示提升权限
} from "@ant-design/icons";

// 修复：将 avatar?: string | null 改为 avatar?: string | undefined（符合 ESLint no-restricted-syntax 规则）
interface GroupInvitation {
  invitationId: number;
  inviter: { userId: number; userName: string; avatar?: string | undefined };
  invitee: { userId: number; userName: string; avatar?: string | undefined };
  create_at: string;
  message?: string;
}

const GroupInvitationVerifyScreen = () => {
  const router = useRouter();
  const { group_id, group_name } = router.query;
  const authInfo = useSelector((state: RootState) => state.auth);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(false);

  /** Fetch all pending Group invitations (sent TO the current user) */
  const fetchGroupInvitations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/invite/get/group/pending/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authInfo.token}`,
        }
      });

      const res = await response.json();
      console.log("Fetched pending group invitations:", res);

      if (res.code === 0) {
        // 修复：将 null 替换为 undefined（符合项目 ESLint 配置）
        setInvitations(res.invitationList || []);
      } else {
        message.error(res.info || "Failed to load group invitations.");
      }
    } catch (err) {
      console.error("Error fetching group invitations:", err);
      message.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /** Accept or reject a Group invitation */
  const respondToInvitation = async (invitationId: number, action: "accept" | "reject") => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/invite/respond/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authInfo.token}`,
        },
        body: JSON.stringify({
          invitationId,
          invitationOp: action // "accept" or "reject"
        }),
      });

      const res = await response.json();
      console.log("Responded to group invitation:", res);

      if (res.code === 0) {
        message.success(
          action === "accept"
            ? "Group invitation accepted!"
            : "Group invitation rejected."
        );
        fetchGroupInvitations(); // refresh the list
      } else {
        message.error(res.info || "Failed to update Group invitation.");
      }
    } catch (err) {
      console.error("Error updating Group invitation:", err);
      message.error("Network error. Please try again.");
    }
  };

  useEffect(() => {
    fetchGroupInvitations();
  }, []);

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "50px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      {/* 顶部导航 */}
      <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => router.back()}
          style={{ marginRight: "16px" }}
        />
        <h2 style={{ margin: 0, color: "#333" }}>{group_name} - 邀请审核</h2>
      </div>

      <List
        loading={loading}
        dataSource={invitations}
        renderItem={(req) => (
          <List.Item>
            <Card
              style={{
                borderRadius: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {/* Sender info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
                    <UserOutlined style={{ marginRight: "8px", color: "#1890ff" }} />
                    <strong>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {req.invitee.userName}
                        {<Tag color="blue">申请者</Tag>}
                      </div>
                    </strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", color: "#666" }}>
                    <UserAddOutlined style={{ marginRight: "8px" }} />
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {req.inviter.userName}
                      {<Tag color="blue">邀请者</Tag>}
                    </div>
                  </div>
                </div>

                {/* Accept / Reject buttons */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    type="primary"
                    onClick={() => respondToInvitation(req.invitationId, "accept")}
                  >
                    接受
                  </Button>
                  <Button
                    danger
                    onClick={() => respondToInvitation(req.invitationId, "reject")}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
};

export default GroupInvitationVerifyScreen;