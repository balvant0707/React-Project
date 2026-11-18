// Ported 1:1 from COMPASS (app/src/pages/people/directory.tsx).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, Empty, Tag, Typography } from "antd";
import { CalendarOutlined, GiftOutlined, MailOutlined, MobileOutlined, PhoneOutlined, TrophyOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "@rbp/core";
import { formatBirthday, hasLeft, monthCelebrations, personName, telHref, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";

// Birthdays and anniversaries of the current month, as one line above the cards.
const Celebrations = ({ people }: { people: PersonRow[] }) => {
  const { t } = useTranslation();
  const items = useMemo(() => monthCelebrations(people, dayjs().month() + 1), [people]);
  if (!items.length) return null;
  return (
    <Card size="small" style={{ marginBottom: 16 }} title={<><CalendarOutlined /> {t("people.thisMonth")}</>}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((c) => (
          <Link key={`${c.kind}-${c.person.id}`} to={`/people/${c.person.id}`}>
            <Tag icon={c.kind === "birthday" ? <GiftOutlined /> : <TrophyOutlined />} color={c.kind === "birthday" ? "magenta" : "gold"} style={{ cursor: "pointer", margin: 0 }}>
              {c.day}. {personName(c.person)}
              {c.kind === "anniversary" ? ` · ${t("people.years", { count: c.years })}` : ""}
            </Tag>
          </Link>
        ))}
      </div>
    </Card>
  );
};

const PersonCard = ({ person, teams }: { person: PersonRow; teams: string[] }) => {
  const { t, i18n } = useTranslation();
  return (
    <Card size="small" hoverable styles={{ body: { display: "flex", gap: 12 } }}>
      <PersonAvatar person={person} size={56} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link to={`/people/${person.id}`} style={{ fontWeight: 600, display: "block", lineHeight: 1.3 }}>
          {personName(person)}
        </Link>
        {person.position && <Typography.Text type="secondary" style={{ display: "block" }}>{person.position}</Typography.Text>}
        <div style={{ margin: "4px 0", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {teams.map((n) => <Tag key={n} style={{ margin: 0 }}>{n}</Tag>)}
          {!person.has_login && <Tag style={{ margin: 0 }}>{t("people.noLogin")}</Tag>}
          {hasLeft(person) && <Tag color="default" style={{ margin: 0 }}>{t("people.former")}</Tag>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
          {person.phone_office && <a href={telHref(person.phone_office)}><PhoneOutlined /> {person.phone_office}</a>}
          {person.phone_mobile && <a href={telHref(person.phone_mobile)}><MobileOutlined /> {person.phone_mobile}</a>}
          {person.email && <a href={`mailto:${person.email}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><MailOutlined /> {person.email}</a>}
          {person.site && <Typography.Text type="secondary">{person.site}</Typography.Text>}
          {person.birthday_month && person.birthday_day && (
            <Typography.Text type="secondary"><GiftOutlined /> {formatBirthday(person.birthday_month, person.birthday_day, i18n.language)}</Typography.Text>
          )}
        </div>
      </div>
    </Card>
  );
};

export const PeopleCards = ({ people, teamsOf, unfiltered }: { people: PersonRow[]; teamsOf: Map<string, string[]>; unfiltered: boolean }) => {
  const { t } = useTranslation();
  return (
  <>
    {unfiltered && <Celebrations people={people.filter((p) => !hasLeft(p))} />}
    {people.length === 0 ? (
      <Empty description={t("common.noMatches")} />
    ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {people.map((p) => <PersonCard key={p.id} person={p} teams={teamsOf.get(p.id) ?? []} />)}
      </div>
    )}
  </>
  );
};
