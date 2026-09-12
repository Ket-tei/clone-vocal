"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Brief } from "@/lib/api";

const VIDE: Brief = {
  prospect_name: "", company: "", role: "", stake: "", goal: "",
  expected_objections: [], tone: "professionnel et direct", target_duration_min: 10,
};

export function BriefForm({
  onSubmit, occupe,
}: {
  onSubmit: (b: Brief) => void;
  occupe: boolean;
}) {
  const [brief, setBrief] = useState<Brief>(VIDE);
  const [objections, setObjections] = useState("");
  const set = (k: keyof Brief) => (e: { target: { value: string } }) =>
    setBrief({ ...brief, [k]: e.target.value });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...brief,
          expected_objections: objections.split("\n").map((s) => s.trim()).filter(Boolean),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="prospect">Nom du prospect</Label>
          <Input id="prospect" required value={brief.prospect_name} onChange={set("prospect_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="societe">Société</Label>
          <Input id="societe" required value={brief.company} onChange={set("company")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fonction">Fonction</Label>
        <Input id="fonction" value={brief.role} onChange={set("role")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="enjeu">Son enjeu</Label>
        <Textarea id="enjeu" required rows={2} value={brief.stake} onChange={set("stake")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objectif">Votre objectif pour ce rendez-vous</Label>
        <Textarea id="objectif" required rows={2} value={brief.goal} onChange={set("goal")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objections">Objections attendues, une par ligne</Label>
        <Textarea
          id="objections" rows={3} value={objections}
          onChange={(e) => setObjections(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={occupe}>
        {occupe ? "Génération du script..." : "Générer la présentation"}
      </Button>
    </form>
  );
}
