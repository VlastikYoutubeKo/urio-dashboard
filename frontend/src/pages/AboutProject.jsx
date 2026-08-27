import { useState } from 'react';
import { BookOpen, HelpCircle, Network, ShieldCheck, Zap, ArrowRight, ChevronDown, Globe, Info, Lock, Users, Cpu, ExternalLink } from 'lucide-react';

export default function AboutProject({ lang = 'cs' }) {
  const [activeFaq, setActiveFaq] = useState(null);
  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  const faqs = [
    {
      q: t("What exactly is URnetwork?", "Co přesně je URnetwork?"),
      a: t(
        "URnetwork (ur.io) is a peer-to-peer privacy network — not a traditional VPN. Instead of routing your traffic through a company's servers, URnetwork routes it through a mesh of community-run devices worldwide. Your traffic is encrypted on your device and split across multiple hops, so no single node can see both who you are and what you're accessing. The company behind it is BringYour, Inc., based in San Francisco.",
        "URnetwork (ur.io) je peer-to-peer privátní síť — nikoli tradiční VPN. Místo aby váš provoz procházel servery nějaké firmy, prochází sítí komunitních zařízení po celém světě. Provoz je šifrován přímo na vašem zařízení a rozdělen přes více skoků, takže žádný jednotlivý uzel nevidí zároveň to, kdo jste, a co děláte. Společnost za sítí je BringYour, Inc. se sídlem v San Franciscu."
      )
    },
    {
      q: t("How is URnetwork different from a regular VPN?", "Čím se URnetwork liší od normální VPN?"),
      a: t(
        "A traditional VPN centralizes your trust in one company and one set of servers — if they log your traffic or get hacked, your privacy is gone. URnetwork distributes that trust across thousands of independent nodes using Tor-like onion routing. No central party can see the full picture. The entire codebase is 100% open-source on GitHub, so anyone can verify the claims. URnetwork also avoids known VPN datacenter IP ranges, making it harder to detect and block.",
        "Tradiční VPN soustřeďuje vaši důvěru do jedné firmy a jedné sady serverů — pokud logují váš provoz nebo jsou napadeni, vaše soukromí je v ohrožení. URnetwork distribuuje tuto důvěru přes tisíce nezávislých uzlů pomocí cibulového routování podobného Toru. Žádná centrální strana nevidí celý obraz. Celý zdrojový kód je 100% open-source na GitHubu, takže si každý může tvrzení ověřit. URnetwork také nepoužívá známé IP adresy VPN datových center, takže je obtížnější ho detekovat a blokovat."
      )
    },
    {
      q: t("What is the difference between ur.io and ur.xyz?", "Jaký je rozdíl mezi ur.io a ur.xyz?"),
      a: t(
        "ur.io is the official website of BringYour, Inc. — the commercial operator running the URnetwork service. ur.xyz is the home of the independent UR protocol itself, operated separately from BringYour. This means the protocol is open and anyone can build their own operator or client on top of it. BringYour is just one operator of the UR protocol.",
        "ur.io je oficiální web společnosti BringYour, Inc. — komerčního operátora provozujícího službu URnetwork. ur.xyz je domovem samotného nezávislého UR protokolu, provozovaného odděleně od BringYour. To znamená, že protokol je otevřený a kdokoli může na jeho základě vybudovat vlastního operátora nebo klienta. BringYour je jen jedním operátorem UR protokolu."
      )
    },
    {
      q: t("How does the provider program work?", "Jak funguje program pro poskytovatele?"),
      a: t(
        "Anyone can become a provider by running the Ur provider app on Windows, macOS, Linux, or Android (also available as a browser extension for Chrome and Firefox). The app shares your spare bandwidth with the network in a sandboxed, safe way. You earn USDC (stablecoin on Solana or Polygon blockchain) for every gigabyte routed through your device. Critically, running the app does NOT automatically make your device an exit node — you have to explicitly opt in to providing bandwidth.",
        "Kdokoli se může stát poskytovatelem spuštěním aplikace Ur provider na Windows, macOS, Linuxu nebo Androidu (dostupná také jako rozšíření prohlížeče pro Chrome a Firefox). Aplikace sdílí vaši volnou šířku pásma se sítí bezpečným, sandboxovaným způsobem. Za každý gigabajt přenesený přes vaše zařízení vyděláváte USDC (stablecoin na blockchainu Solana nebo Polygon). Klíčové je, že spuštění aplikace VÁS AUTOMATICKY NEUDĚLÁ výstupním uzlem — musíte explicitně souhlasit se sdílením šířky pásma."
      )
    },
    {
      q: t("Is sharing my bandwidth safe?", "Je sdílení šířky pásma bezpečné?"),
      a: t(
        "URnetwork is designed to be \"Default Safe\" for providers. Network traffic passing through your node is sandboxed and encrypted. The platform implements strict category-level filters that block known abuse patterns (malware distribution, CSAM, etc.) before traffic can affect your connection. Your personal data and local network devices are never exposed to the traffic being routed.",
        "URnetwork je navržen tak, aby byl pro poskytovatele 'standardně bezpečný'. Síťový provoz procházející vaším uzlem je sandboxován a šifrován. Platforma implementuje přísné kategoriální filtry, které blokují známé vzory zneužití (distribuce malwaru, CSAM atd.) dříve, než provoz může ovlivnit vaše připojení. Vaše osobní data a lokální síťová zařízení nejsou nikdy vystavena procházejícímu provozu."
      )
    },
    {
      q: t("What does this stats dashboard track?", "Co tento stats dashboard sleduje?"),
      a: t(
        "This dashboard aggregates data from your own URnetwork accounts via the BringYour API (api.bringyour.com). It tracks: 1) Your per-account transfer statistics — paid bytes (already paid out in USDC) and unpaid bytes (accrued, not yet paid out), 2) Global network stats — active providers in each country, growth trends, and outage detection, 3) Your payout history, devices, and network score.",
        "Tento dashboard agreguje data z vašich vlastních URnetwork účtů přes BringYour API (api.bringyour.com). Sleduje: 1) Statistiky přenosů vašich účtů — zaplacené bajty (již vyplacené v USDC) a nezaplacené bajty (naakumulované, dosud nevyplacené), 2) Globální statistiky sítě — aktivní poskytovatelé v každé zemi, trendy růstu a detekce výpadků, 3) Historii výplat, zařízení a skóre sítě."
      )
    }
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0c0c0e] to-black border border-[#222] p-8 md:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400">
            <Info className="w-3.5 h-3.5" />
            {t("About ur.io / URnetwork", "O projektu ur.io / URnetwork")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            {t("The Privacy Network", "The Privacy Network")}
          </h1>
          <p className="text-lg text-[#888] leading-relaxed">
            {t(
              "Whole-internet encryption, powered by people. URnetwork routes your traffic through a community mesh of real devices — no central servers, no logs, no trust required.",
              "Šifrování celého internetu, poháněné lidmi. URnetwork přesměrovává váš provoz přes komunitní síť reálných zařízení — žádné centrální servery, žádné logy, žádná nutná důvěra."
            )}
          </p>

          {/* Live stats from ur.io homepage (August 2026) */}
          <div className="flex flex-wrap gap-6 pt-2">
            <div>
              <div className="text-2xl font-bold text-white">95,000+</div>
              <div className="text-xs text-[#666]">{t("providers worldwide", "providerů světadě")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">111</div>
              <div className="text-xs text-[#666]">{t("countries", "zemí")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">884,000+</div>
              <div className="text-xs text-[#666]">{t("networks", "sítí")}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <a 
              href="https://ur.io/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 transition-all flex items-center gap-2 text-sm"
            >
              {t("Official ur.io Website", "Oficiální web ur.io")}
              <ArrowRight className="w-4 h-4" />
            </a>
            <a 
              href="https://ur.io/install" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg bg-[#111] text-gray-300 border border-[#333] hover:border-[#555] hover:text-white font-semibold transition-all flex items-center gap-2 text-sm"
            >
              {t("Download App", "Stáhnout aplikaci")}
              <ExternalLink className="w-4 h-4" />
            </a>
            <a 
              href="https://github.com/VlastikYoutubeKo/urio-dashboard/blob/main/CHANGELOG.md" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg bg-[#111] text-gray-300 border border-[#333] hover:border-[#555] hover:text-white font-semibold transition-all flex items-center gap-2 text-sm"
            >
              {t("Changelog", "Zápis změn")}
              <BookOpen className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            {t("How the network works", "Jak síť funguje")}
          </h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "When you connect through URnetwork, your traffic is encrypted on your device and routed through multiple community-run nodes using a Tor-like multi-hop architecture. No single node ever sees both your identity and what you're accessing — privacy is built into the architecture, not just promised.",
              "Když se připojíte přes URnetwork, váš provoz je šifrován přímo na vašem zařízení a přesměrován přes několik komunitních uzlů pomocí víceúrovňové architektury podobné Toru. Žádný jednotlivý uzel nikdy nevidí zároveň vaši identitu i to, k čemu přistupujete — soukromí je zabudováno do architektury, nejen slibováno."
            )}
          </p>
          <ul className="space-y-2 text-xs text-gray-300">
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              {t("Traffic encrypted end-to-end on your device before leaving", "Provoz šifrován end-to-end na vašem zařízení ještě před odesláním")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              {t("Multi-hop routing — no single node sees full path", "Víceúrovňové routování — žádný uzel nevidí celou cestu")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              {t("Zero logs stored by the network operator", "Operátor sítě neukládá žádné logy")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              {t("100% open-source and reproducibly auditable", "100% open-source a reprodukovatelně auditovatelné")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              {t("Residential IPs — bypasses VPN detection more reliably than datacenter VPNs", "Rezidenční IP — spolehlivěji obchází detekci VPN než datecenterové VPN")}
            </li>
          </ul>
        </div>

        <div className="card space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            {t("Earn by sharing bandwidth", "Vydělávejte sdílením šířky pásma")}
          </h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "Run the Ur provider app on any device and earn USDC passively for the spare bandwidth you share. Payouts happen automatically on a weekly basis, sent directly to your Solana or Polygon wallet. You control when and how much you share.",
              "Spusťte aplikaci Ur provider na jakémkoli zařízení a pasivně vydělávejte USDC za volnou šířku pásma, kterou sdílíte. Výplaty probíhají automaticky na týdenní bázi, posílány přímo do vaší peněženky Solana nebo Polygon. Vy kontrolujete kdy a kolik sdílíte."
            )}
          </p>
          <ul className="space-y-2 text-xs text-gray-300">
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              {t("Windows, macOS, Linux, Android, iOS, Chrome & Firefox extensions", "Windows, macOS, Linux, Android, iOS, rozšíření pro Chrome a Firefox")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              {t("Paid out in USDC on Solana or Polygon", "Vypláceno v USDC na Solana nebo Polygon")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              {t("Opt-in only — your device is NOT an exit node by default", "Pouze na základě souhlasu — vaše zařízení NENÍ výchozím výstupním uzlem")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              {t("Traffic sandboxed and filtered for abuse categories", "Provoz sandboxován a filtrován proti kategoriím zneužití")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              {t("Earnings vary by location, availability and amount of traffic routed", "Výdělky se liší podle polohy, dostupnosti a množství přesměrovaného provozu")}
            </li>
          </ul>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card hover:border-blue-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5 text-blue-400 group-hover:bg-blue-500/20 transition-all">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("Open Protocol", "Otevřený protokol")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "UR is an open protocol — anyone can run their own operator or client. BringYour, Inc. (ur.io) is just one operator. The independent protocol lives at ur.xyz.",
              "UR je otevřený protokol — kdokoli může provozovat vlastního operátora nebo klienta. BringYour, Inc. (ur.io) je jen jedním operátorem. Nezávislý protokol žije na ur.xyz."
            )}
          </p>
        </div>

        <div className="card hover:border-purple-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5 text-purple-400 group-hover:bg-purple-500/20 transition-all">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("Performance Auctions", "Výkonnostní aukce")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "The network uses real-time performance auctions to automatically select the fastest and most reliable nodes for each connection — no manual server selection needed.",
              "Síť používá výkonnostní aukce v reálném čase k automatickému výběru nejrychlejších a nejspolehlivějších uzlů pro každé připojení — bez nutnosti ručního výběru serveru."
            )}
          </p>
        </div>

        <div className="card hover:border-emerald-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 group-hover:bg-emerald-500/20 transition-all">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("DePIN Network", "DePIN síť")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "URnetwork is a Decentralized Physical Infrastructure Network (DePIN) — real people's real devices form the backbone. This is why it resists censorship and VPN blocking better than traditional services.",
              "URnetwork je decentralizovaná síť fyzické infrastruktury (DePIN) — skutečná zařízení skutečných lidí tvoří páteř sítě. Proto odolává cenzuře a blokování VPN lépe než tradiční služby."
            )}
          </p>
        </div>
      </div>

      {/* About this dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Network className="w-6 h-6 text-blue-500" />
            {t("About this dashboard", "O tomto dashboardu")}
          </h2>
          <p className="text-base text-[#888] leading-relaxed">
            {t(
              "This is an unofficial third-party stats dashboard for URnetwork. It runs a Python Flask backend that connects to the official BringYour API (api.bringyour.com) using your account credentials, stores data locally in SQLite, and visualizes it in a React frontend.",
              "Toto je neoficiální dashboard třetí strany pro URnetwork. Provozuje Python Flask backend, který se připojuje k oficiálnímu BringYour API (api.bringyour.com) pomocí vašich přihlašovacích údajů, ukládá data lokálně v SQLite a vizualizuje je v React frontendu."
            )}
          </p>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Multi-account support", "Podpora více účtů")}</h4>
                <p className="text-xs text-[#888]">{t("Track multiple URnetwork provider accounts from a single dashboard with per-account breakdowns.", "Sledujte více URnetwork provider účtů z jediného dashboardu s rozpisem podle účtu.")}</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Global provider analytics", "Globální analytika providerů")}</h4>
                <p className="text-xs text-[#888]">{t("Hourly snapshots of provider counts by country with trend analysis, movers, and outage detection.", "Hodinové snímky počtů providerů podle zemí s analýzou trendů, pohybů a detekcí výpadků.")}</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Discord webhooks", "Discord webhooky")}</h4>
                <p className="text-xs text-[#888]">{t("Configurable Discord webhook notifications for payouts and periodic summaries with custom JSON templates.", "Konfigurovatelné Discord webhook notifikace pro výplaty a periodické souhrny s vlastními JSON šablonami.")}</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Auth Code generator", "Generátor Auth Kódu")}</h4>
                <p className="text-xs text-[#888]">{t("Generate one-time auth codes to authenticate provider nodes or log into the app without your password.", "Generujte jednorázové auth kódy pro autentizaci provider uzlů nebo přihlášení do aplikace bez hesla.")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#222] bg-[#0c0c0e] p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-[#222]">
            <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">{t("Tech Stack", "Technologický stack")}</span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px] text-blue-400 font-mono">{t("OPEN SOURCE", "OPEN SOURCE")}</span>
          </div>
          
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">Flask + APScheduler</span>
              <span className="text-blue-400">Python backend</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">SQLAlchemy + SQLite</span>
              <span className="text-purple-400">Data storage</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">React + Tailwind + Recharts</span>
              <span className="text-emerald-400">Frontend</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">api.bringyour.com</span>
              <span className="text-orange-400">URnetwork API</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">github.com/VlastikYoutubeKo</span>
              <span className="text-gray-400">Source code</span>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <HelpCircle className="w-6 h-6 text-purple-500" />
          {t("Frequently Asked Questions", "Časté dotazy (FAQ)")}
        </h2>
        <div className="space-y-4 max-w-3xl">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div 
                key={idx} 
                className="border border-[#222] rounded-xl overflow-hidden transition-colors duration-200"
                style={{ backgroundColor: isOpen ? '#0c0c0e' : 'transparent' }}
              >
                <button
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full px-6 py-4 flex justify-between items-center text-left text-white font-medium hover:text-gray-200 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown 
                    className={`w-5 h-5 text-[#666] transition-transform duration-200 flex-shrink-0 ml-4 ${isOpen ? 'rotate-180 text-white' : ''}`} 
                  />
                </button>
                <div 
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-96 border-t border-[#222] p-6' : 'max-h-0'}`}
                >
                  <p className="text-sm text-[#888] leading-relaxed">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Links footer */}
      <div className="card bg-gradient-to-br from-[#0c0c0e] to-black">
        <h3 className="text-lg font-bold text-white mb-4">{t("Useful links", "Užitečné odkazy")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: "https://ur.io", label: "ur.io" },
            { href: "https://ur.xyz", label: "ur.xyz (Protocol)" },
            { href: "https://ur.io/install", label: t("Download app", "Stáhnout aplikaci") },
            { href: "https://ur.io/docs", label: t("Documentation", "Dokumentace") },
            { href: "https://github.com/urnetwork", label: "GitHub (open source)" },
            { href: "https://grafana.bringyour.com/stats", label: t("Network stats (Grafana)", "Statistiky sítě (Grafana)") },
            { href: "https://ur.io/provider", label: t("Become a provider", "Staňte se providerem") },
            { href: "https://github.com/VlastikYoutubeKo/urio-dashboard", label: t("This dashboard's source", "Zdrojový kód tohoto dashboardu") },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors group"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0 group-hover:text-blue-400" />
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
