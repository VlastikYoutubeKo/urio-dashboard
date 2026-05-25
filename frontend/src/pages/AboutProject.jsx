import { useState } from 'react';
import { BookOpen, HelpCircle, Network, ShieldCheck, Zap, ArrowRight, ChevronDown, Activity, Globe, Info, Download, Coins } from 'lucide-react';

export default function AboutProject({ lang = 'cs' }) {
  const [activeFaq, setActiveFaq] = useState(null);
  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  const faqs = [
    {
      q: t("What is ur.io and UrNetwork?", "Co je to ur.io a UrNetwork?"),
      a: t(
        "ur.io (UrNetwork) is a decentralized peer-to-peer network focused on internet connection and residential proxy sharing. Users worldwide share their unused bandwidth via the client application, building a global, highly distributed, censorship-resistant web proxy and Content Delivery Network (CDN).",
        "ur.io (UrNetwork) je decentralizovaná peer-to-peer síť zaměřená na sdílení internetové konektivity a rezidenčních proxy. Uživatelé z celého světa poskytují svou nevyužitou šířku pásma prostřednictvím klientské aplikace a vytvářejí tak globální, vysoce distribuovanou, cenzuře odolnou síť proxy a doručování obsahu (CDN)."
      )
    },
    {
      q: t("What is the difference between ur.io and BringYour?", "Jaký je rozdíl mezi ur.io a BringYour?"),
      a: t(
        "Ur (ur.io) is the customer-facing brand for providers and clients. BringYour (bringyour.io / bringyour.com) is the internal infrastructure and developer API backend (e.g., api.bringyour.com) running behind the scenes, managing node authentication, traffic logging, and billing systems.",
        "Ur (ur.io) je název samotného produktu pro koncové uživatele, poskytovatele a zákazníky sítě. BringYour.io / BringYour.com představuje interní infrastrukturu a vývojářské API rozhraní (např. api.bringyour.com), které běží na pozadí a zajišťuje autentizaci uzlů, logování přenosů a fakturační systémy."
      )
    },
    {
      q: t("How does the provider program work?", "Jak funguje program pro poskytovatele (Ur Provider)?"),
      a: t(
        "Anyone can download the Ur Provider application for Windows, macOS, Linux, or Android. Once launched, it runs quietly in the background, sharing your connection's spare capacity securely. For every gigabyte shared, you earn points which are periodically paid out in USDC on the Solana blockchain as passive income.",
        "Každý uživatel si může stáhnout aplikaci Ur Provider pro Windows, macOS, Linux nebo Android. Po spuštění aplikace běží tiše na pozadí a bezpečně sdílí volnou kapacitu vašeho připojení. Za každý gigabajt sdílených dat získáváte body, které jsou pravidelně vypláceny v USDC na blockchainu Solana jako pasivní příjem."
      )
    },
    {
      q: t("Is sharing bandwidth via ur.io safe?", "Je sdílení připojení přes ur.io bezpečné?"),
      a: t(
        "Yes. The Ur Provider client uses advanced sandbox isolation. Shared network traffic is sandboxed, encrypted, and passes through rigorous platform filters, ensuring your personal data, local network, and devices remain 100% secure and protected from misuse.",
        "Ano. Aplikace Ur Provider využívá pokročilou sandbox technologii. Klientský provoz je izolován, šifrován a prochází přísnými bezpečnostními filtry sítě, což zajišťuje, že vaše soukromá data, lokální síť i zařízení zůstanou 100% v bezpečí a chráněny před zneužitím."
      )
    },
    {
      q: t("What metrics does this stats dashboard track?", "Jaké metriky tento dashboard vlastně sleduje?"),
      a: t(
        "This stats dashboard aggregates two main data groups: 1) Transfer statistics for your own accounts (Paid data are bytes that have already been paid out to you, and Unpaid data represent bytes transferred by users for which you have not yet been paid by the system), and 2) Global ur.io network metrics (total active nodes, geographical distribution, and outage detection alerts).",
        "Tento stats dashboard shromažďuje a analyzuje dva hlavní typy dat: 1) Statistiky přenosů vašich vlastních registrovaných účtů (placená data/Paid jsou data, která se vám již vyplatila, a neplacená data/Unpaid jsou data, která uživatel dostává, ale ještě za ně nedostal zaplaceno od systému) a 2) Globální metriky sítě ur.io (celkový počet aktivních uzlů po celém světě, regionální rozložení kapacity a detekci náhlých výpadků v jednotlivých státech)."
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
            {t("About ur.io project", "O projektu ur.io")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            {t("Decentralized Residential Proxy Network", "Decentralizovaná rezidenční proxy síť")}
          </h1>
          <p className="text-lg text-[#888] leading-relaxed">
            {t(
              "UrNetwork (ur.io) revolutionizes web content delivery and proxy services. It enables the global community to build premium infrastructure powered by sharing unused internet connections.",
              "UrNetwork (ur.io) přináší revoluci v doručování webového obsahu a proxy službách. Umožňuje komunitě vybudovat globální infrastrukturu postavenou na sdílení volného internetového připojení."
            )}
          </p>
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
              href="https://github.com/VlastikYoutubeKo/urio-dashboard/blob/main/CHANGELOG.md" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg bg-[#111] text-gray-300 border border-[#333] hover:border-[#555] hover:text-white font-semibold transition-all flex items-center gap-2 text-sm"
            >
              {t("Changelog & Updates", "Zápis změn (Changelog)")}
              <BookOpen className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Detail explanation cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            {t("Become a Provider (Ur Provider)", "Staňte se poskytovatelem (Ur Provider)")}
          </h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "Download the client for your device and start earning passive income immediately. The app runs completely unnoticeably and uses only the capacity you don't currently need.",
              "Stáhněte si klienta pro vaše zařízení a začněte okamžitě vydělávat. Aplikace běží zcela nepozorovaně a využívá pouze kapacitu, kterou zrovna nepotřebujete."
            )}
          </p>
          <ul className="space-y-2 text-xs text-gray-300 font-mono">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {t("Windows, macOS, Linux, Android support", "Podpora pro Windows, macOS, Linux, Android")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {t("Payouts only in USDC on Solana blockchain", "Výplaty pouze v USDC na blockchainu Solana")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {t("Secure and sandboxed network traffic isolation", "Bezpečná a sandboxed izolace provozu sítě")}
            </li>
          </ul>
        </div>

        <div className="card space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-purple-400" />
            {t("Network for Customers", "Využití sítě pro zákazníky")}
          </h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "Customers gain access to highly reliable residential proxies worldwide. The network is ideal for anonymous browsing, web scraping, localized service testing, and bypassing geoblocks.",
              "Zákazníci sítě získávají přístup k vysoce spolehlivým rezidenčním proxy po celém světě. Síť je ideální pro anonymní prohlížení, sběr dat (scraping), testování lokalizovaných služeb a obcházení geoblokace."
            )}
          </p>
          <ul className="space-y-2 text-xs text-gray-300 font-mono">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> {t("Real residential IP addresses globally", "Skutečné rezidenční IP adresy po celém světě")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> {t("High speed throughput and minimal latency", "Vysoká rychlost přenosu a minimální latence")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> {t("Censorship and blocks-resistant architectural design", "Cenzuře a blokování odolný architektonický design")}
            </li>
          </ul>
        </div>
      </div>

      {/* Core Values / Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card hover:border-blue-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5 text-blue-400 group-hover:bg-blue-500/20 transition-all">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("Global Scope", "Globální rozsah")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "We track providers in over 100 countries, aggregating them into 6 main continental regions for maximum clarity.",
              "Sledujeme poskytovatele ve více než 100 zemích a agregujeme je do 6 hlavních kontinentálních regionů pro maximální přehlednost."
            )}
          </p>
        </div>

        <div className="card hover:border-purple-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5 text-purple-400 group-hover:bg-purple-500/20 transition-all">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("Outage Detection", "Detekce výpadků")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "Our system automatically alerts on sudden changes in node counts (over 15% hourly), helping detect local internet outages early.",
              "Náš systém automaticky upozorňuje na náhlé změny v počtu uzlů (nad 15 % za hodinu), což pomáhá včas odhalit lokální internetové výpadky."
            )}
          </p>
        </div>

        <div className="card hover:border-emerald-500/30 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 group-hover:bg-emerald-500/20 transition-all">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t("Growth Forecasting", "Předpověď růstu")}</h3>
          <p className="text-sm text-[#888] leading-relaxed">
            {t(
              "Based on daily stats, we calculate long-term growth trends and project future network sizes for 30 and 90 days ahead.",
              "Na základě denních statistik počítáme dlouhodobý trend růstu a predikujeme budoucí velikost sítě na 30 a 90 dní dopředu."
            )}
          </p>
        </div>
      </div>

      {/* Tech Stack & Architecture Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Network className="w-6 h-6 text-blue-500" />
            {t("How does this dashboard work?", "Jak funguje tento dashboard?")}
          </h2>
          <p className="text-base text-[#888] leading-relaxed">
            {t(
              "The application runs on a stable, optimized Python Flask backend communicating with the BringYour API (`api.bringyour.com`), saving data in a local SQLite database.",
              "Aplikace běží na stabilním a optimalizovaném Python Flask backendu, který komunikuje přímo s BringYour API (`api.bringyour.com`). Data ukládá do lokální SQLite databáze."
            )}
          </p>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Automated Data Sourcing", "Automatický sběr dat")}</h4>
                <p className="text-xs text-[#888]">{t("APScheduler background task fetches provider country counts hourly without affecting main server performance.", "APScheduler na pozadí každou hodinu stahuje počty uzlů podle zemí bez zatížení hlavního serverového vlákna.")}</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Modern React + Tailwind Frontend", "Moderní React + Tailwind Frontend")}</h4>
                <p className="text-xs text-[#888]">{t("Visualizes data using interactive Recharts graphs, tracking deltas across 13 different time windows.", "Vizualizuje data pomocí interaktivních grafů Recharts a sleduje delty změn ve 13 různých časových oknech.")}</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div>
                <h4 className="text-sm font-semibold text-white">{t("Smart Memory Management", "Chytrá správa paměti")}</h4>
                <p className="text-xs text-[#888]">{t("Daily automatic cleanup of stats older than 90 days prevents excessive database size expansion.", "Automatické čištění dat starších 90 dnů předchází nadbytečnému růstu databáze.")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#222] bg-[#0c0c0e] p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-[#222]">
            <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">{t("Integration Components", "Komponenty integrace")}</span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px] text-blue-400 font-mono">{t("ACTIVE", "AKTIVNÍ")}</span>
          </div>
          
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">models.ProviderCount</span>
              <span className="text-blue-400">SQLAlchemy ORM</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">scheduler.poll_providers_job</span>
              <span className="text-purple-400">APScheduler</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">routes.api_bp (/api/provider/*)</span>
              <span className="text-emerald-400">Flask JSON API</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-black/40 border border-[#1a1a1a]">
              <span className="text-gray-400">frontend.ProvidersDashboard</span>
              <span className="text-orange-400">React + Recharts Tabs</span>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <HelpCircle className="w-6 h-6 text-purple-500" />
          {t("Frequently Asked Questions (FAQ)", "Časté dotazy (FAQ)")}
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
                    className={`w-5 h-5 text-[#666] transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`} 
                  />
                </button>
                <div 
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-60 border-t border-[#222] p-6' : 'max-h-0'}`}
                >
                  <p className="text-sm text-[#888] leading-relaxed">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
