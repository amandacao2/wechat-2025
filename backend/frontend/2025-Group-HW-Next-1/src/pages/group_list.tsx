import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX, GROUP_API } from "../constants/string";
import { Avatar, List, Card, Button, message, Badge } from "antd";
import { GroupOutlined, PlusOutlined, BellOutlined, SettingOutlined } from "@ant-design/icons";

interface GroupItem {
    id: number;
    name: string;
    avatar?: string;
    member_count: number;
    description?: string;
    unread_count: number;
    is_muted: boolean;
    last_message?: string;
    last_message_time?: string;
    notice?: string;
}

const GroupListScreen: React.FC = () => {
    const router = useRouter();
    const { token } = useSelector((state: RootState) => state.auth);
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string>("");

    // 拉取群列表
    const fetchGroups = async (): Promise<void> => {
        setLoading(true);
        setErrorMsg("");
        try {
            const response = await fetch(GROUP_API.LIST, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const res = await response.json();
            if (Number(res.code) === 0) {
                const formattedGroups: GroupItem[] = (res.results || []).map((group: any) => ({
                    id: group.id || 0,
                    name: group.name || "未命名群",
                    avatar: group.avatar === null ? "" : `${BACKEND_URL}${group.avatar}`,
                    member_count: group.member_count || 0,
                    description: group.description || "",
                    unread_count: group.unread_count || 0,
                    is_muted: group.is_muted || false,
                    last_message: group.last_message || "",
                    last_message_time: group.last_message_time || "",
                    notice: group.notice || "",
                }));
                setGroups(formattedGroups);
            } else {
                setErrorMsg(res.info || "获取群列表失败");
                message.error(res.info || "获取群列表失败");
            }
        } catch (err) {
            const errStr = `${FAILURE_PREFIX}${err}`;
            setErrorMsg(errStr);
            message.error(errStr);
        } finally {
            setLoading(false);
        }
    };

    // 切换群免打扰
    const toggleGroupMute = async (groupId: number, currentMuted: boolean): Promise<void> => {
        try {
            const response = await fetch(GROUP_API.MUTE(groupId), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ muted: !currentMuted }),
            });
            const res = await response.json();
            if (Number(res.code) === 0) {
                setGroups(prev =>
                    prev.map(group =>
                        group.id === groupId ? { ...group, is_muted: !currentMuted } : group
                    )
                );
                message.success(currentMuted ? "已关闭群免打扰" : "已开启群免打扰");
            } else {
                message.error(res.info || "切换免打扰失败");
            }
        } catch (err) {
            message.error(`${FAILURE_PREFIX}${err}`);
        }
    };

    // 跳转群聊天
    const goToGroupChat = (group: GroupItem): void => {
        router.push({
            pathname: "/group_chat",
            query: {
                group_id: group.id.toString(),
                group_name: group.name,
                group_avatar: group.avatar,
            },
        });
    };

    // 跳转群详情
    const goToGroupDetail = (groupId: number, e: React.MouseEvent<HTMLElement>): void => {
        e.stopPropagation();
        router.push({
            pathname: "/group_detail",
            query: { group_id: groupId.toString() },
        });
    };

    // 跳转创建群聊
    const goToCreateGroup = (): void => {
        router.push("/create_group");
    };

    useEffect(() => {
        if (token) {
            fetchGroups();
        }
    }, [token]);

    return (
        <div
            style={{
                maxWidth: "420px",
                margin: "40px auto",
                padding: "20px",
                border: "1px solid #eee",
                borderRadius: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
        >
            {/* 顶部标题和创建按钮 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "25px",
                }}
            >
                <h2 style={{ margin: 0, color: "#333" }}>我的群聊</h2>
                <Button
                    icon={<PlusOutlined />}
                    type="primary"
                    size="middle"
                    onClick={goToCreateGroup}
                    style={{ padding: "6px 12px" }}
                >
                    创建群聊
                </Button>
            </div>

            {/* 错误提示 */}
            {errorMsg && (
                <div
                    style={{
                        color: "#ff4444",
                        textAlign: "center",
                        marginBottom: "15px",
                    }}
                >
                    {errorMsg}
                </div>
            )}

            {/* 群聊列表 */}
            <List
                loading={loading}
                dataSource={groups}
                renderItem={(group: GroupItem) => (
                    <List.Item
                        key={group.id}
                        onClick={() => goToGroupChat(group)}
                        style={{ cursor: "pointer", marginBottom: "10px" }}
                    >
                        <Card
                            hoverable
                            style={{
                                width: "100%",
                                borderRadius: "8px",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                                position: "relative",
                            }}
                            actions={[
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<SettingOutlined />}
                                    onClick={(e) => goToGroupDetail(group.id, e)}
                                    style={{ color: "#2196F3" }}
                                >
                                    群设置
                                </Button>,
                            ]}
                        >
                            {/* 免打扰按钮 */}
                            <Button
                                icon={
                                    <BellOutlined
                                        style={{
                                            textDecoration: group.is_muted ? "line-through" : "none",
                                        }}
                                    />
                                }
                                type="text"
                                style={{
                                    position: "absolute",
                                    top: "10px",
                                    right: "10px",
                                    color: group.is_muted ? "#ff4444" : "#666",
                                    padding: "4px",
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupMute(group.id, group.is_muted);
                                }}
                            />

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    padding: "12px",
                                }}
                            >
                                {/* 群头像 */}
                                <div style={{ position: "relative" }}>
                                    <Avatar
                                        src={group.avatar === "" ? "https://picsum.photos/100" : group.avatar}
                                        size="large"
                                        style={{ width: "60px", height: "60px" }}
                                    />
                                    {/* 未读消息计数 */}
                                    {group.unread_count > 0 && (
                                        <Badge
                                            count={group.unread_count}
                                            style={{
                                                position: "absolute",
                                                top: "-5px",
                                                right: "-5px",
                                                backgroundColor: "#ff4444",
                                            }}
                                        />
                                    )}
                                </div>

                                {/* 群信息 */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                            marginBottom: "4px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                flex: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            <h3
                                                style={{
                                                    margin: 0,
                                                    fontSize: "16px",
                                                    color: "#333",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {group.name}
                                            </h3>
                                            {group.notice && (
                                                <Badge dot color="#52c41a" title="有群公告" />
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                fontSize: "12px",
                                                color: "#999",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {group.member_count} 人
                                        </span>
                                    </div>

                                    {/* 最后一条消息 */}
                                    {group.last_message && (
                                        <div
                                            style={{
                                                margin: "0",
                                                fontSize: "12px",
                                                color: "#666",
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {group.last_message.length > 30
                                                ? `${group.last_message.slice(0, 30)}...`
                                                : group.last_message}
                                        </div>
                                    )}

                                    {/* 最后消息时间 */}
                                    {group.last_message_time && (
                                        <div
                                            style={{
                                                margin: "4px 0 0 0",
                                                fontSize: "10px",
                                                color: "#999",
                                            }}
                                        >
                                            {new Date(group.last_message_time).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </List.Item>
                )}
            />
        </div>
    );
};

export default GroupListScreen;