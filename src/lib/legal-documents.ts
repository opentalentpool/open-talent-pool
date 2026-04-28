import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER_CNPJ,
  LEGAL_CONTROLLER_NAME,
  LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL,
  LEGAL_POLICY_KEY,
  LEGAL_POLICY_ROUTE,
  LEGAL_POLICY_VERSION,
} from "@/lib/legal-policies.js";

interface LegalDocumentSection {
  title: string;
  paragraphs: string[];
  items?: string[];
}

export interface LegalDocumentDefinition {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  path: string;
  policyKey: string;
  version: string;
  effectiveDateLabel: string;
  summary: string[];
  sections: LegalDocumentSection[];
}

export const LEGAL_DOCUMENTS = {
  privacyPolicy: {
    eyebrow: "Privacidade",
    title: "Política de Privacidade",
    description:
      "Como o OpenTalentPool trata autenticação por código, perfil público manual, favoritos, buscas salvas, alertas, busca inclusiva, exportação de dados e exclusão de conta.",
    label: "Política de Privacidade",
    path: LEGAL_POLICY_ROUTE.privacyPolicy,
    policyKey: LEGAL_POLICY_KEY.privacyPolicy,
    version: LEGAL_POLICY_VERSION.privacyPolicy,
    effectiveDateLabel: LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL,
    summary: [
      "Autenticação por e-mail com código, cookie essencial de sessão, armazenamento opcional só após consentimento e autoatendimento de exportação e exclusão no dashboard.",
      "Somente perfis publicados entram na vitrine pública; o e-mail da conta e os dados afirmativos autodeclarados não aparecem publicamente; e-mail de contato só pode ser exibido a recrutadores autenticados quando o profissional ativa esse canal.",
      "Esta política documenta bases legais por finalidade, retenção por categoria, logs privados de acesso ao contato, denúncias autenticadas com revisão administrativa, notificações transacionais de moderação, retenção mínima pseudonimizada após banimento definitivo e o canal LGPD complementar em `contato@opentalentpool.org`.",
    ],
    sections: [
      {
        title: "1. Escopo desta política",
        paragraphs: [
          "Esta política cobre o tratamento de dados pessoais realizado pelo OpenTalentPool na navegação pública, no cadastro, na autenticação por e-mail com código, na edição do perfil profissional, no painel do recrutador, nos alertas por e-mail e nos fluxos de busca inclusiva.",
          `O controlador informado neste documento é ${LEGAL_CONTROLLER_NAME}, com referência societária ao CNPJ ${LEGAL_CONTROLLER_CNPJ}.`,
        ],
      },
      {
        title: "2. Dados que tratamos",
        paragraphs: [
          "No cadastro e no acesso, tratamos nome, e-mail, papel da conta, token anti-bot, desafio de autenticação, código de verificação, sessão autenticada e metadados mínimos de segurança, como IP e user-agent.",
          "Na conta autenticada, tratamos perfis habilitados para a mesma identidade, como profissional e recrutador, além do contexto ativo da sessão quando a pessoa alterna entre esses papéis sem novo login.",
          "No perfil profissional, tratamos dados técnicos e profissionais informados pela própria pessoa usuária, como headline, bio, cidade, estado, senioridade, modelos de trabalho, skills, experiências, links profissionais, disponibilidade e estado de publicação.",
        ],
        items: [
          "O e-mail da conta permanece privado e não integra a descoberta pública.",
          "O profissional pode habilitar um e-mail de contato separado, exibido apenas a recrutadores autenticados na página detalhada do perfil.",
          "Favoritos, buscas salvas e alertas pertencem ao ambiente autenticado do recrutador.",
          "A autodeclaração afirmativa é opcional, não pública e restrita ao fluxo inclusivo descrito na política específica.",
          "Logs privados de acesso ao e-mail de contato, denúncias feitas pela própria pessoa usuária e decisões administrativas de moderação ficam restritos ao ambiente autenticado e ao backoffice administrativo.",
        ],
      },
      {
        title: "3. Bases legais por finalidade",
        paragraphs: [
          "O OpenTalentPool usa bases legais compatíveis com cada operação. A mesma conta pode envolver mais de uma base, conforme a funcionalidade utilizada e o papel ativo da pessoa usuária.",
        ],
        items: [
          "Autenticação por código, manutenção de sessão, prevenção de abuso, trilhas de segurança e operação do produto: legítimo interesse e execução dos serviços solicitados pela pessoa usuária.",
          "Cadastro, manutenção de conta, edição de perfil, favoritos, buscas salvas, alertas e alternância entre perfis habilitados: execução de procedimentos preliminares e da relação contratual de uso da plataforma.",
          "Registro de aceite de políticas, proteção contra fraude, defesa em processos e preservação de trilhas mínimas de auditoria: exercício regular de direitos e cumprimento de obrigações legais ou regulatórias aplicáveis.",
          "Exibição pública do perfil quando o profissional publica manualmente o currículo: execução do serviço solicitado e decisão da própria pessoa usuária de colocar o perfil na vitrine.",
          "Exibição de e-mail de contato a recrutadores autenticados quando o profissional ativa esse canal: consentimento operacional do próprio profissional, revogável a qualquer momento no dashboard.",
          "Registro privado de acessos ao e-mail de contato, denúncias autenticadas, revisão administrativa e sanções contra abuso do canal: legítimo interesse em segurança, prevenção de fraude, exercício regular de direitos e aplicação dos termos públicos da plataforma.",
          "Autodeclaração afirmativa opcional e uso da busca inclusiva: consentimento específico, informado, destacado e revogável do profissional para o uso inclusivo descrito nesta política e na Política de Uso Inclusivo.",
        ],
      },
      {
        title: "4. O que é público, o que permanece privado e como funciona a indexação",
        paragraphs: [
          "Somente as informações profissionais de perfis publicados entram na busca pública e na página pública do perfil. Isso inclui headline, bio, stack, experiências, senioridade, localização ampla, modelos de trabalho, disponibilidade e links profissionais informados pela própria pessoa usuária.",
          "O e-mail da conta, favoritos, buscas salvas, alertas, sessões, aceites, autodeclarações afirmativas e trilhas internas de segurança ou auditoria não aparecem na vitrine pública.",
          "Perfis ocultados por decisão administrativa deixam a busca pública e a página detalhada do perfil até eventual restauração interna.",
          "O site permite indexação pública de perfis publicados por mecanismos de busca. Após despublicação, exclusão ou ocultação administrativa, o perfil deixa de ser servido pela plataforma, mas a remoção de resultados já indexados depende do ciclo de atualização do buscador e, quando necessário, pode exigir pedido adicional de desindexação ao próprio provedor de busca.",
        ],
      },
      {
        title: "5. Critérios gerais de busca, ranking e uso inclusivo",
        paragraphs: [
          "A busca pública e autenticada considera aderência textual, senioridade, disponibilidade, modelos de trabalho, localização e recência do perfil para organizar resultados de forma útil e operacional.",
          "Na busca inclusiva, o recrutador autenticado precisa aceitar a política específica do fluxo, informar o tipo da vaga e registrar uma referência curta da oportunidade. Quando filtros afirmativos são usados, os perfis aderentes ao recorte afirmativo aparecem priorizados no topo, mas os demais perfis tecnicamente aderentes permanecem na mesma lista.",
          "Esse ranqueamento não equivale a decisão automatizada de contratação. Ele é um mecanismo de descoberta e priorização de leitura dentro da plataforma.",
        ],
      },
      {
        title: "6. Dados afirmativos opcionais",
        paragraphs: [
          "A autodeclaração afirmativa é opcional. Nenhum profissional precisa informar raça, etnia, deficiência, identidade de gênero, orientação sexual, pertencimento LGBTQIAPN+ ou outro atributo afirmativo para criar conta, editar perfil ou publicar currículo.",
          "Quando a pessoa escolhe se autodeclarar, esse dado não entra na busca pública, não aparece na página pública do perfil e só pode ser usado em fluxos inclusivos específicos previstos no produto.",
          "A revogação pode ser feita no dashboard profissional por ação explícita de remoção da autodeclaração, com atualização do perfil pelo fluxo normal de salvamento.",
        ],
      },
      {
        title: "7. Cookies, armazenamento local e retenção",
        paragraphs: [
          "O OpenTalentPool usa um cookie essencial de sessão em `HttpOnly` para manter a autenticação no navegador e um cookie essencial `open-talent-pool-cookie-consent` para lembrar a escolha entre armazenamento opcional e sessão essencial.",
          "Tema, retomada local de desafio por e-mail e rascunhos locais do perfil só são persistidos quando a pessoa aceita armazenamento opcional. O rascunho local usa a chave `professional_profile_draft:v2:*` e não persiste `affirmativeProfile` nem `affirmativeConsentAccepted`.",
          "A retenção operacional segue a lógica abaixo, sem prejuízo de períodos maiores quando houver necessidade de segurança, auditoria, defesa em processo ou cumprimento de obrigação legal.",
        ],
        items: [
          "Desafios OTP, tentativas e pendências de autenticação: até 15 minutos, com bloqueios temporários de segurança quando houver abuso ou tentativas inválidas.",
          "Sessão autenticada `otp_session`: expiração por inatividade em até 24 horas e limite absoluto padrão de até 7 dias, salvo configuração mais restritiva do ambiente.",
          "Cookie `open-talent-pool-cookie-consent`: mantido para lembrar a decisão pública sobre armazenamento opcional até alteração manual da preferência.",
          "Chave local `otp_pending_auth_session`: até 15 minutos, somente quando a pessoa aceita armazenamento opcional.",
          "Chave local `professional_profile_draft:v2:*`: até 30 dias ou até ser substituída, removida pela pessoa usuária, rejeitada no banner ou tornada desnecessária após salvamento.",
          "Perfis publicados: até despublicação, exclusão da conta ou remoção operacional da vitrine; perfis podem sair da descoberta pública após 180 dias sem atualização.",
          "Logs privados de acesso ao e-mail de contato: pelo tempo necessário para segurança, responsabilização, resposta a denúncias e defesa da plataforma.",
          "Favoritos e buscas salvas: até exclusão manual pelo recrutador ou exclusão da conta.",
          "Denúncias autenticadas, decisões administrativas e restrições contra abuso do canal: pelo tempo necessário para moderação, auditoria, segurança e exercício regular de direitos.",
          "Banimento definitivo por moderação: a conta operacional e o perfil são removidos, mas a plataforma pode manter apenas um hash não reversível do e-mail normalizado, o registro jurídico mínimo pseudonimizado e snapshots administrativos estritamente necessários para impedir novo ingresso indevido, auditoria e defesa.",
          "Registros de aceite, ledger jurídico mínimo e trilha auditável da busca inclusiva: pelo tempo necessário para auditoria, segurança, exercício regular de direitos e defesa da plataforma, inclusive após exclusão da conta em formato pseudonimizado quando isso for estritamente necessário.",
        ],
      },
      {
        title: "8. Compartilhamento, operadores e transferências internacionais",
        paragraphs: [
          "O OpenTalentPool não vende dados pessoais. O tratamento pode envolver operadores e provedores de infraestrutura necessários para a operação técnica do serviço, como hospedagem, banco de dados, entrega de e-mails, CDN ou proxy reverso e mecanismos anti-bot.",
          "A implementação documentada usa Cloudflare Turnstile para proteção anti-bot. Esse fluxo trata sinais técnicos como token do desafio, IP, user-agent, origem e outros metadados operacionais necessários à verificação.",
          "Dependendo da infraestrutura efetivamente contratada, alguns desses operadores podem processar dados fora do Brasil. Quando isso ocorrer, o tratamento seguirá salvaguardas compatíveis com a legislação aplicável e com a finalidade operacional descrita nesta política.",
        ],
      },
      {
        title: "9. Direitos do titular e autoatendimento",
        paragraphs: [
          "A pessoa usuária pode pedir confirmação de tratamento, acesso, correção, atualização, exclusão, revogação de consentimento, informação sobre compartilhamento, oposição e esclarecimentos sobre o funcionamento da plataforma nos limites da LGPD.",
          "O dashboard autenticado oferece autoatendimento para exportação em JSON, exclusão permanente da conta com confirmação forte por e-mail digitado, revogação da autodeclaração afirmativa pelo fluxo normal de edição do perfil, consulta aos acessos privados ao e-mail de contato e submissão autenticada de denúncias.",
          "Quando uma denúncia é recebida, a pessoa denunciante recebe confirmação por e-mail. Quando uma sanção é aplicada, a pessoa alvo recebe comunicação por e-mail com o enquadramento administrativo e o canal de revisão cabível.",
          "A exportação inclui os próprios relatos de denúncia feitos pela pessoa usuária, os logs de acesso ao seu e-mail de contato e eventuais restrições ativas sobre sua conta ou perfil, sem revelar identidade de terceiros denunciantes nem notas internas da moderação.",
          "A exclusão de conta remove os dados operacionais do produto, como conta, perfil, favoritos, buscas salvas, sessões e vínculos de uso. A plataforma mantém apenas trilhas mínimas pseudonimizadas quando estritamente necessárias para auditoria, segurança, exercício regular de direitos ou defesa.",
          "Se houver banimento definitivo por moderação, a remoção operacional também pode preservar apenas o hash do e-mail normalizado e o registro jurídico mínimo necessário para impedir reingresso abusivo e resguardar a plataforma.",
        ],
      },
      {
        title: "10. Segurança, incidentes e contato",
        paragraphs: [
          "O produto usa validação anti-bot, limitação de tentativas, registros mínimos de segurança, cookie de sessão `HttpOnly`, proteção de origem em rotas sensíveis e política de conteúdo restrita no backend para reduzir riscos como abuso automatizado e exposição indevida.",
          "Incidentes relevantes de segurança serão tratados conforme a gravidade, a natureza dos dados envolvidos e os deveres legais aplicáveis, inclusive com avaliação de comunicação aos titulares e às autoridades competentes quando necessário.",
          `Solicitações de privacidade, direitos do titular, dúvidas sobre esta política ou denúncias relacionadas ao tratamento de dados podem ser feitas pelo fluxo autenticado disponível na plataforma; o canal ${LEGAL_CONTACT_EMAIL} permanece como via complementar para temas legais e LGPD.`,
        ],
      },
    ],
  },
  termsOfUse: {
    eyebrow: "Termos",
    title: "Termos de Uso",
    description:
      "Regras do OpenTalentPool para descoberta pública, publicação manual de perfis, painéis autenticados, contato entre profissionais e recrutadores e uso responsável da busca inclusiva.",
    label: "Termos de Uso",
    path: LEGAL_POLICY_ROUTE.termsOfUse,
    policyKey: LEGAL_POLICY_KEY.termsOfUse,
    version: LEGAL_POLICY_VERSION.termsOfUse,
    effectiveDateLabel: LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL,
    summary: [
      "Publicação manual do perfil, busca pública aberta e painéis autenticados para curadoria, alertas e gestão do próprio perfil.",
      "O serviço é gratuito, exige uso lícito e responsável, e permite suspensão, limitação ou remoção quando houver abuso, fraude, coleta indevida de dados ou descumprimento das políticas públicas vinculadas.",
      "Recrutadores são responsáveis por cumprir a legislação brasileira, inclusive regras trabalhistas, antidiscriminatórias e de proteção de dados, dentro e fora da plataforma.",
    ],
    sections: [
      {
        title: "1. Sobre o serviço",
        paragraphs: [
          "O OpenTalentPool é uma plataforma pública e gratuita de descoberta de talentos em tecnologia. O objetivo do produto é facilitar leitura técnica inicial, curadoria operacional e continuidade de busca sem transformar contato pessoal em moeda de navegação.",
          "O serviço pode evoluir, mudar interfaces, criar ou remover funcionalidades e aplicar restrições operacionais quando isso for necessário para segurança, manutenção, conformidade ou melhoria.",
        ],
      },
      {
        title: "2. Capacidade, idade mínima e representação",
        paragraphs: [
          "Ao usar o OpenTalentPool, a pessoa declara ser maior de 18 anos ou legalmente capaz para praticar os atos necessários à utilização da plataforma.",
          "Se a conta de recrutador for usada em nome de uma empresa, a pessoa usuária declara ter autorização para agir em nome dessa organização dentro do fluxo de busca, contato e curadoria realizado na plataforma.",
        ],
      },
      {
        title: "3. Regras para contas profissionais",
        paragraphs: [
          "A pessoa profissional é responsável pelas informações que publica em seu perfil e decide quando esse perfil entra ou sai da descoberta pública.",
          "O cadastro não exige preenchimento de atributos sensíveis para liberar conta, edição ou publicação. O serviço foi desenhado para destacar aderência técnica, não para forçar exposição pessoal desnecessária.",
          "Perfis públicos precisam permanecer minimamente atualizados. Se um currículo publicado ficar longos períodos sem atualização, ele pode sair da vitrine pública até passar por nova atualização e publicação manual.",
        ],
      },
      {
        title: "4. Regras para recrutadores e curadoria",
        paragraphs: [
          "A busca pública pode ser usada sem conta para exploração inicial. Favoritos, buscas salvas, alertas, visualização de e-mail de contato habilitado e busca inclusiva exigem autenticação e uso para finalidades legítimas de recrutamento, prospecção ou curadoria profissional.",
          "O recrutador não pode usar a plataforma para assédio, scraping agressivo, revenda de dados, coleta automatizada não autorizada, engenharia reversa abusiva, criação de base paralela ou qualquer operação que prejudique a disponibilidade, a segurança ou a privacidade do serviço.",
          "Quando o profissional habilitar um e-mail de contato, essa informação pode ser usada apenas para abordagem legítima relacionada à oportunidade ou à curadoria profissional compatível com a finalidade do produto.",
        ],
      },
      {
        title: "5. Busca inclusiva e responsabilidade trabalhista",
        paragraphs: [
          "A funcionalidade de busca inclusiva existe apenas para vagas afirmativas e inclusivas explicitadas pelo recrutador dentro do produto. Ela não equivale a garantia automática de legalidade da vaga nem substitui a análise jurídica da empresa recrutadora.",
          "O recrutador é exclusivamente responsável por cumprir a legislação brasileira aplicável ao processo seletivo, inclusive regras trabalhistas, antidiscriminatórias, de igualdade de oportunidades e de proteção de dados pessoais.",
          "É vedado usar filtros afirmativos para excluir currículos por critérios não técnicos, ranquear de forma discriminatória, inferir atributos sensíveis fora da autodeclaração, exportar listas paralelas ou manter bases próprias incompatíveis com a finalidade inclusiva declarada.",
        ],
      },
      {
        title: "6. Conteúdo publicado, licença limitada e dados de terceiros",
        paragraphs: [
          "A pessoa usuária deve publicar apenas informações verdadeiras, atualizadas, pertinentes ao contexto profissional e compatíveis com este serviço.",
          "Ao publicar conteúdo no perfil, a pessoa concede ao OpenTalentPool licença limitada, gratuita, não exclusiva e revogável para hospedar, reproduzir, indexar internamente, exibir publicamente o perfil quando ele estiver publicado e operar a busca do produto até a despublicação ou exclusão.",
          "Não é permitido publicar dados pessoais ou sensíveis de terceiros sem base legítima, inserir conteúdo ilícito, ofensivo, fraudulento ou que viole direitos autorais, segredos de negócio, honra, imagem ou privacidade de outras pessoas.",
        ],
      },
      {
        title: "7. Denúncia, takedown e sanções",
        paragraphs: [
          "Perfis profissionais públicos podem ser denunciados por membros autenticados na própria plataforma. Acessos indevidos de recrutadores ao e-mail de contato podem ser denunciados pelo profissional no dashboard, a partir do log privado de acessos ao seu contato.",
          "Toda denúncia entra em revisão administrativa humana antes de qualquer remoção, ocultação de perfil, suspensão de conta, banimento definitivo ou arquivamento. Não há remoção automática apenas por volume de denúncias.",
          "Cada denúncia recebida pela plataforma gera confirmação transacional por e-mail para a pessoa denunciante. Quando houver sanção, a pessoa alvo recebe comunicação por e-mail com o resultado administrativo e o canal de revisão aplicável.",
          "Para perfis profissionais públicos, o fluxo ordinário de sanção é progressivo: primeira ocorrência punitiva com ocultação do perfil para correção, segunda com suspensão da conta e terceira com banimento definitivo e exclusão dos dados operacionais.",
          "Conteúdo discriminatório grave em perfil público, inclusive manifestações racistas, pode levar a banimento definitivo imediato e irrevogável na plataforma, sem passar pela escada progressiva.",
          "Denúncias ligadas ao acesso de recrutadores ao e-mail de contato não seguem a escada progressiva do perfil público e podem resultar em suspensão direta após revisão humana, conforme a gravidade do caso.",
          "O OpenTalentPool poderá limitar, suspender, remover conteúdo, ocultar perfil público, bloquear funcionalidades ou encerrar contas quando identificar risco operacional, uso indevido, fraude de aceite, denúncia de má-fé, tentativa de contornar proteções técnicas ou violação destes termos e das políticas públicas vinculadas.",
          `Denúncias e pedidos de takedown também podem ser enviados para ${LEGAL_CONTACT_EMAIL} como canal complementar.`,
        ],
      },
      {
        title: "8. Disponibilidade, propriedade intelectual e limites de responsabilidade",
        paragraphs: [
          "A plataforma é fornecida conforme seu estado operacional. Não há promessa de disponibilidade irrestrita, ausência total de falhas ou adequação universal a todos os processos de recrutamento.",
          "Marcas, identidade visual, código, textos institucionais, estrutura do serviço e demais elementos próprios da plataforma permanecem protegidos pela legislação aplicável e não podem ser copiados ou explorados fora dos limites permitidos por lei e por estes termos.",
          "Na extensão permitida pela legislação aplicável, o OpenTalentPool não se responsabiliza por decisões de contratação, negociações entre usuários, veracidade integral de informações fornecidas por terceiros ou danos indiretos decorrentes do uso do serviço gratuito.",
        ],
      },
      {
        title: "9. Lei aplicável, foro e contato",
        paragraphs: [
          "Estes termos são regidos pela legislação brasileira.",
          "Quando a legislação de proteção do consumidor ou outra norma imperativa garantir foro específico ao titular, esse foro prevalecerá. Nos demais casos, fica eleito o foro da comarca de Salvador, Bahia, para dirimir controvérsias relacionadas a estes termos.",
          `Dúvidas operacionais e comunicações sobre estes termos podem ser enviadas para ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  cookiesPolicy: {
    eyebrow: "Cookies",
    title: "Política de Cookies e Tecnologias Similares",
    description:
      "Quais cookies, chaves locais e tecnologias similares o OpenTalentPool usa, o que é essencial, o que é opcional e como a escolha pública de consentimento funciona.",
    label: "Política de Cookies",
    path: LEGAL_POLICY_ROUTE.cookiesPolicy,
    policyKey: LEGAL_POLICY_KEY.cookiesPolicy,
    version: LEGAL_POLICY_VERSION.cookiesPolicy,
    effectiveDateLabel: LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL,
    summary: [
      "Cookie essencial de sessão para autenticação segura no backend e cookie essencial separado para lembrar a escolha pública feita no banner.",
      "Tema, retomada local do desafio por e-mail e rascunhos locais do perfil só funcionam quando a pessoa aceita armazenamento opcional; o rascunho usa `professional_profile_draft:v2:*` e não persiste dados afirmativos nem o aceite afirmativo.",
      "A plataforma não usa cookies opcionais de analytics, marketing ou publicidade, mas usa Cloudflare Turnstile como tecnologia anti-bot de terceiro.",
    ],
    sections: [
      {
        title: "1. Como esta política se aplica",
        paragraphs: [
          "Esta política cobre cookies, `localStorage` e tecnologias similares usadas pelo OpenTalentPool para autenticação, segurança, preferências funcionais e continuidade opcional de fluxos no navegador.",
          "Mesmo quando a tecnologia não é tecnicamente um cookie, ela é documentada aqui porque produz efeito semelhante de armazenamento no dispositivo da pessoa usuária.",
        ],
      },
      {
        title: "2. Cookies essenciais",
        paragraphs: [
          "Os itens abaixo são necessários para a operação básica do serviço, para manter a sessão autenticada e para respeitar a decisão pública sobre armazenamento opcional.",
        ],
        items: [
          "`otp_session` — cookie essencial de sessão, `HttpOnly`, usado para manter a autenticação segura no backend até a expiração da sessão.",
          "`open-talent-pool-cookie-consent` — cookie essencial usado para lembrar se a pessoa aceitou armazenamento opcional ou preferiu continuar apenas com a sessão essencial.",
        ],
      },
      {
        title: "3. Armazenamento opcional no navegador",
        paragraphs: [
          "Quando a pessoa aceita armazenamento opcional, o frontend pode usar `localStorage` para melhorar a continuidade de uso no mesmo navegador. Se a pessoa rejeitar, essas chaves deixam de ser usadas e, quando aplicável, são removidas.",
        ],
        items: [
          "`open-talent-pool-theme` — preferência visual de tema claro, escuro ou sistema; fica armazenada até limpeza manual do navegador ou revogação da preferência.",
          "`otp_pending_auth_session` — continuidade local do desafio de autenticação por e-mail com código; armazena e-mail, `challengeId`, intenção do fluxo e expiração por até 15 minutos.",
          "`professional_profile_draft:v2:{userId}` — autosave funcional do rascunho do perfil profissional; armazena dados técnicos do perfil, skills, experiências e estado auxiliar do formulário por até 30 dias; não persiste `affirmativeProfile` nem `affirmativeConsentAccepted`.",
        ],
      },
      {
        title: "4. Tecnologias de terceiro e segurança anti-bot",
        paragraphs: [
          "O OpenTalentPool usa Cloudflare Turnstile para proteção anti-bot em fluxos públicos de autenticação. Esse mecanismo envolve carregamento de script, frame e conexão com a infraestrutura da Cloudflare para verificar sinais técnicos e reduzir abuso automatizado.",
          "O produto não usa cookies opcionais de analytics, remarketing, publicidade comportamental ou compartilhamento comercial de audiência.",
        ],
      },
      {
        title: "5. Como gerenciar a escolha",
        paragraphs: [
          "No primeiro acesso, o OpenTalentPool exibe um banner com duas opções: aceitar armazenamento opcional ou continuar apenas com o essencial.",
          "A pessoa usuária pode reabrir as preferências pela própria política pública ou pelo banner quando disponível. Ao rejeitar armazenamento opcional, o produto mantém a sessão autenticada por cookie quando aplicável, mas deixa de usar tema persistido, continuidade local do OTP e rascunhos locais entre recargas.",
          "Se o produto adicionar analytics, publicidade ou novas tecnologias opcionais, esta política será atualizada antes do uso correspondente.",
        ],
      },
    ],
  },
  inclusiveUsePolicy: {
    eyebrow: "Uso inclusivo",
    title: "Política de Uso Inclusivo",
    description:
      "Regras públicas para autodeclaração afirmativa opcional no perfil profissional e para uso exclusivamente inclusivo dos filtros afirmativos por recrutadores autenticados.",
    label: "Política de Uso Inclusivo",
    path: LEGAL_POLICY_ROUTE.inclusiveUsePolicy,
    policyKey: LEGAL_POLICY_KEY.inclusiveUsePolicy,
    version: LEGAL_POLICY_VERSION.inclusiveUsePolicy,
    effectiveDateLabel: LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL,
    summary: [
      "Uso exclusivamente inclusivo em vagas afirmativas e inclusivas, com autodeclaração opcional, consentimento destacado e sem exposição pública de dados sensíveis.",
      "Profissionais podem revogar a autodeclaração no dashboard; recrutadores precisam aceitar a política operacional do fluxo, informar tipo da vaga e referência curta da oportunidade.",
      "A plataforma mantém auditoria mínima pseudonimizada do aceite e do uso inclusivo para segurança, responsabilização e defesa, sem transformar esse dado em base pública ou comercial.",
    ],
    sections: [
      {
        title: "1. Finalidade desta política",
        paragraphs: [
          "A busca inclusiva existe para apoiar casos legítimos de inclusão, diversidade, vagas afirmativas e vagas inclusivas dentro do OpenTalentPool.",
          "Ela não existe para ampliar filtragem excludente, reduzir pessoas a atributos sensíveis nem permitir discriminação indevida travestida de operação de recrutamento.",
        ],
      },
      {
        title: "2. Dados afirmativos abrangidos e sensibilidade",
        paragraphs: [
          "Os grupos afirmativos disponíveis no fluxo inclusivo podem envolver informações relacionadas a raça, etnia, deficiência, identidade de gênero ou pertencimento LGBTQIAPN+, temas que exigem tratamento reforçado, minimização e governança proporcional.",
          "Por isso, esse dado é sempre opcional, não público, fora da busca aberta e isolado do uso comum da plataforma.",
        ],
      },
      {
        title: "3. Consentimento do profissional, revogação e minimização",
        paragraphs: [
          "A autodeclaração afirmativa depende de consentimento livre, informado, específico, destacado e revogável. O produto não pré-marca esse aceite e não condiciona conta, edição ou publicação do perfil a essa informação.",
          "A revogação pode ser feita diretamente no dashboard profissional por ação explícita de remoção da autodeclaração. Após o salvamento, o perfil deixa de ser priorizado pelos recortes afirmativos correspondentes.",
          "O rascunho local do perfil não persiste `affirmativeProfile` nem `affirmativeConsentAccepted`, mesmo quando a pessoa aceita armazenamento opcional para outros dados do formulário.",
        ],
      },
      {
        title: "4. Regras para recrutadores",
        paragraphs: [
          "O recrutador autenticado só pode usar filtros afirmativos depois de aceitar a política operacional do fluxo, selecionar o tipo da vaga e registrar uma referência curta da oportunidade.",
          "A busca técnica padrão mantém perfis tecnicamente aderentes, inclusive de grupos minorizados, mesmo quando nenhum critério inclusivo está ativo.",
          "Quando a busca inclusiva for usada, os perfis dentro do escopo afirmativo aparecem primeiro, mas os demais perfis tecnicamente aderentes permanecem na mesma lista.",
          "É vedado usar essa funcionalidade para excluir currículos por critérios não técnicos, inferir atributos sensíveis fora da autodeclaração, tomar decisões discriminatórias, exportar listas paralelas ou justificar práticas incompatíveis com a legislação aplicável.",
        ],
      },
      {
        title: "5. Auditoria mínima, retenção e exclusão de conta",
        paragraphs: [
          "O aceite do recrutador e cada execução da busca inclusiva geram trilha mínima de auditoria com data, tipo de uso, referência da vaga, critérios aplicados, versão e hash da política e identificador pseudonimizado do ator.",
          "A exclusão de conta remove os dados operacionais vinculados ao usuário, mas a plataforma pode manter essa trilha mínima pseudonimizada quando isso for estritamente necessário para segurança, responsabilização, exercício regular de direitos ou defesa em processo.",
          "A autodeclaração afirmativa operacional permanece no perfil até revogação, atualização do próprio profissional ou exclusão da conta. Após exclusão, não se mantém o dado afirmativo operacional, apenas a trilha mínima necessária e pseudonimizada.",
        ],
      },
      {
        title: "6. Denúncia, canal LGPD e responsabilização",
        paragraphs: [
          "Uso discriminatório, tentativa de inferência sensível fora da autodeclaração, criação de base paralela, assédio ou qualquer desvio de finalidade pode levar à suspensão de funcionalidades, remoção de conta e adoção de medidas adicionais cabíveis.",
          "Quando a conduta estiver ligada a um perfil público ou ao acesso de um recrutador ao e-mail de contato, a denúncia deve ser feita preferencialmente pelo fluxo autenticado da plataforma para preservar contexto, trilha auditável e revisão administrativa.",
          `Denúncias, pedidos de revisão e comunicações relacionadas a este fluxo também podem ser enviados para ${LEGAL_CONTACT_EMAIL} como via complementar.`,
        ],
      },
    ],
  },
} satisfies Record<string, LegalDocumentDefinition>;

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;

export function getLegalDocument(documentKey: LegalDocumentKey) {
  return LEGAL_DOCUMENTS[documentKey];
}
