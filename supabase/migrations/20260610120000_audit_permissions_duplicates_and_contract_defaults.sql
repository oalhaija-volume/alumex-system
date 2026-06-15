grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.activity_logs to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.quotations to authenticated;
grant select, insert, update, delete on table public.contracts to authenticated;

grant all on table public.documents to service_role;
grant all on table public.activity_logs to service_role;

alter table public.documents enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_own_or_management" on public.activity_logs;
drop policy if exists "activity_logs_insert_active" on public.activity_logs;
drop policy if exists "activity_logs_update_admin" on public.activity_logs;
drop policy if exists "activity_logs_delete_admin" on public.activity_logs;

create policy "activity_logs_select_own_or_management"
on public.activity_logs
for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or actor_id = auth.uid()
);

create policy "activity_logs_insert_active"
on public.activity_logs
for insert
to authenticated
with check (
  public.is_active_user()
  and (actor_id = auth.uid() or actor_id is null)
);

create policy "activity_logs_update_admin"
on public.activity_logs
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "activity_logs_delete_admin"
on public.activity_logs
for delete
to authenticated
using (public.is_admin());

do $$
begin
  if not exists (
    select 1
    from public.clients
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null
    group by regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
    having count(*) > 1
  ) then
    create unique index if not exists clients_unique_normalized_mobile_idx
    on public.clients ((regexp_replace(coalesce(mobile, ''), '\D', '', 'g')))
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null;
  end if;

  if not exists (
    select 1
    from public.clients
    where nullif(lower(trim(coalesce(email, ''))), '') is not null
    group by lower(trim(coalesce(email, '')))
    having count(*) > 1
  ) then
    create unique index if not exists clients_unique_normalized_email_idx
    on public.clients ((lower(trim(coalesce(email, '')))))
    where nullif(lower(trim(coalesce(email, ''))), '') is not null;
  end if;

  if not exists (
    select 1
    from public.projects
    group by lower(trim(project_number))
    having count(*) > 1
  ) then
    create unique index if not exists projects_unique_normalized_project_number_idx
    on public.projects ((lower(trim(project_number))));
  end if;

  if not exists (
    select 1
    from public.quotations
    group by lower(trim(quotation_number))
    having count(*) > 1
  ) then
    create unique index if not exists quotations_unique_normalized_quotation_number_idx
    on public.quotations ((lower(trim(quotation_number))));
  end if;

  if not exists (
    select 1
    from public.contracts
    group by lower(trim(contract_number))
    having count(*) > 1
  ) then
    create unique index if not exists contracts_unique_normalized_contract_number_idx
    on public.contracts ((lower(trim(contract_number))));
  end if;
end $$;

insert into public.contract_templates (
  id,
  payment_terms,
  warranty_terms,
  execution_terms,
  contract_terms,
  first_party_obligations,
  second_party_obligations
) values (
  'default',
  $$الدفعة الاولى: يلتزم الطرف الثاني بدفع نسبة 50% من القيمة الاجمالية للعقد الى الطرف الاول عند توقيع العقد.
الدفعة الثانية والنهائية: يلتزم الطرف الثاني بدفع كامل المبلغ المتبقي على المشروع حسب الفاتورة النهائية الى الطرف الاول عند جهوزية البضاعة خلال فترة اقصاها سبعة ايام بعد تبليغ الطرف الثاني من قبل الطرف الاول.
في حال كانت القيمة الاجمالية للعقد أقل من (15,000,000) خمسة عشر مليون دينار عراقي تدفع الدفعة كاملة 100% عند توقيع العقد.$$,
  $$يلتزم الطرف الاول بتقديم كفالة مدتها عشرة سنوات بعد تسديد كافة المستحقات المالية عند تسليم المشروع للطرف الثاني مقابل توقيع ورقة استلام وحسب شروط بطاقة الكفالة الخاصة بالطرف الاول.$$,
  $$يلتزم الطرف الاول بالمباشرة بالعمل في الموقع التابع للطرف الثاني خلال فترة اقصاها سبعة ايام عمل من تاريخ تسديد الدفعة النهائية.
مدة تنفيذ المشروع هي (45) خمسة واربعون يوم عمل باستثناء الظروف القاهرة والعطل الرسمية والتوقفات التأخيرية التي تكون بسبب الطرف الثاني.
تحسب مدة تجهيز المشروع من تاريخ الموافقة والتوقيع على مخططات المشروع بعد اخذ القياسات النهائية مع وجوب جاهزية كافة الفتحات الانشائية لتركيب الألمنيوم بالصورة الصحيحة، وليس من تاريخ توقيع هذا العقد.$$,
  $$تعتبر مقدمة هذا العقد جزءا لا يتجزأ منه وهي ناطقة بما فيه ويرجع اليها في تفسير احكامه وبنوده.
اتفق الطرف الاول على توريد اعمال الالمنيوم وتركيبها وهي في حالة ممتازة وخالية من أي عيب مخفي او ظاهر، وبعد ان قام الطرف الثاني باختيارها وتفحصها وفق المواصفات المتفق عليها.
يحسب القياس بالمتر المربع ذرعة هندسية وحسب الذرعة النهائية للمشروع.
المساحة الكلية قابلة للنقصان او الزيادة وحسب الذرعة النهائية للمشروع.
فقط القياس مادون المتر المربع يحسب متر مربع.
يتم تجهيز بضاعة المشروع بناء على موافقة الطرف الثاني الخطية على المخططات المقدمة من قبل الطرف الاول، والتي تتضمن لون الالمنيوم ولون الزجاج وكافة التفاصيل المذكورة في وصف المشروع.
لا يتحمل الطرف الاول مسؤولية اجراء اي تعديل على قياس الفتحات الانشائية بعد توقيع واعتماد الوصف من قبل الطرف الثاني.
هذا العقد غير خاضع لأي تخفيض في الأسعار بعد التوقيع.
أي تعديل خطي بإضافة او شطب على بدن هذا العقد من قبل الطرفين او من ينوب عنهم يعتبر لاغيا.
يتم اعتماد البريد الالكتروني او الكتب الرسمية او الرسائل النصية او الرسائل عبر تطبيق واتس اب المرسلة الى الطرف الثاني او من ينوب عنه كوثائق رسمية للمراسلات بين الطرفين.
ينتهي عقد المقاولة الموقع بين الطرفين باتمام العمل المتفق عليه او بفسخ العقد رضاء او قضاء.
يتكون هذا العقد من ستة بنود اساسية ويقع على خمس صفحات، وتم توقيعه بايجاب وقبول الطرفين وفي مجلس واحد بتاريخ العقد.
يمثل الطرف الاول السادة شركة خبراء الومكس لصناعة وتجارة الالمنيوم المحدودة ويمثلها المدير المفوض او المدير العام او من ينوب عنهم، ويمثل الطرف الثاني السيد/ة او السادة المذكورون في بيانات العقد.$$,
  $$يلتزم الطرف الاول بتوريد وتركيب اعمال الالمنيوم للطرف الثاني حسب المواصفات والكميات المعتمدة.
يلتزم الطرف الاول بالمباشرة بالعمل في الموقع خلال المدة المحددة بعد تسديد الدفعة النهائية وجاهزية الموقع.
يلتزم الطرف الاول بتجهيز المشروع بعد الموافقة والتوقيع على المخططات النهائية واخذ القياسات النهائية.
يلتزم الطرف الاول بتقديم الكفالة حسب شروط بطاقة الكفالة الخاصة به بعد تسديد كافة المستحقات المالية وتسليم المشروع.$$,
  $$يكون الثمن مستحقا بذمة الطرف الثاني من لحظة توقيع العقد وحسب الفاتورة النهائية للمشروع.
اذا استحقت أي دفعة من الدفعات ولم تدفع في موعدها فإن جميع الدفعات اللاحقة تعتبر مستحقة الاداء فورا ودفعة واحدة دون الحاجة لتبادل اية انذارات او اخطارات، ويحق للطرف الاول مطالبة الطرف الثاني بالعطل والضرر اضافة الى فسخ العقد او تنفيذه حسب رغبة الطرف الاول.
لا يجوز للطرف الثاني تغيير مكان العمل بأي حال من الاحوال، ويتعهد بتأمين كافة الوسائل الاساسية لضمان حسن سير العمل حسب المتعارف عليه.
توفير الطريق والكهرباء وتجهيز الموقع للعمل واية اعمال مدنية مثل السكلات او سيارات الرافعات الكهربائية او اي حلوق فريمات اضافية في الموقع هي من مسؤولية الطرف الثاني.
تكون مسؤولية ضمان البضاعة الموردة لموقع العمل على عاتق الطرف الثاني من اللحظة التي يتم فيها تسليم البضاعة اليه، ويكون ملزما بتوفير الحراسة لها في موقع العمل.
يلتزم الطرف الثاني باستلام البضاعة وتجهيز موقع العمل خلال فترة اقصاها شهر من تاريخ تبليغه بجهوزية البضاعة، وخلاف ذلك يتحمل اجورا اضافية مقابل التخزين لدى مستودعات الطرف الاول تبلغ (25,000) دينار عراقي عن كل يوم تأخير.
في حالة التأخير الناتج عن الطرف الثاني في استلام البضاعة لمدة تتجاوز السنة من تاريخ التبليغ بجهوزية البضاعة سيتم اتلاف البضاعة ولا يحق للطرف الثاني المطالبة بها او بثمنها، ويكون كامل مبلغ المشروع مستحقا بذمة الطرف الثاني.$$
)
on conflict (id) do update set
  payment_terms = excluded.payment_terms,
  warranty_terms = excluded.warranty_terms,
  execution_terms = excluded.execution_terms,
  contract_terms = excluded.contract_terms,
  first_party_obligations = excluded.first_party_obligations,
  second_party_obligations = excluded.second_party_obligations,
  updated_at = now();
