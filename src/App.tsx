import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Cloud,
  FileImage,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './App.css'

type Product = {
  id: string
  name: string
  description: string
  category: string
  price: number
  sizes: string[]
  colors: string[]
  stock: number
  status: 'available' | 'sold_out'
  image_url: string | null
  image_path: string | null
  created_at: string
  updated_at: string
}

type Sale = {
  id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  sold_at: string
}

type ProductDraft = {
  name: string
  description: string
  category: string
  price: string
  sizes: string
  colors: string
  stock: string
  imageFile: File | null
  removeImage: boolean
}

type AdminTab = 'dashboard' | 'products' | 'add' | 'sold' | 'inventory' | 'sales' | 'settings'

const categories = ['Shirts', 'Pants', 'Hoodies', 'Jackets', 'Knitwear', 'Accessories']
const pageLoadedAt = new Date()
const emptyDraft: ProductDraft = {
  name: '',
  description: '',
  category: 'Shirts',
  price: '',
  sizes: '',
  colors: '',
  stock: '1',
  imageFile: null,
  removeImage: false,
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [screen, setScreen] = useState<'store' | 'admin'>('store')
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loading, setLoading] = useState(Boolean(supabase))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), [])

  const loadProducts = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    if (error) {
      notify(`Could not load products: ${error.message}`, true)
      setLoading(false)
      return
    }
    setProducts((data ?? []) as Product[])
    setLoading(false)
  }, [notify])

  const loadSales = useCallback(async () => {
    const client = supabase
    if (!client) return
    const { data, error } = await client.from('sales').select('*').order('sold_at', { ascending: false })
    if (error) {
      notify(`Could not load sales history: ${error.message}`, true)
      return
    }
    setSales((data ?? []) as Sale[])
  }, [notify])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let isActive = true

    void client.from('products').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!isActive) return
      if (error) notify(`Could not load products: ${error.message}`, true)
      else setProducts((data ?? []) as Product[])
      setLoading(false)
    })

    const checkAdmin = async (userId: string) => {
      const { data, error } = await client
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!isActive) return
      if (error) {
        setIsAdmin(false)
        notify(`Could not verify store access: ${error.message}`, true)
        return
      }
      setIsAdmin(Boolean(data))
      if (data) void loadSales()
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (!isActive) return
      if (error) {
        notify(`Could not restore your session: ${error.message}`, true)
        return
      }
      setSession(data.session)
      if (data.session?.user) void checkAdmin(data.session.user.id)
    })

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) void checkAdmin(nextSession.user.id)
      else setIsAdmin(false)
    })

    return () => {
      isActive = false
      authListener.subscription.unsubscribe()
    }
  }, [loadSales, notify])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category
      const matchesSearch = !query || [product.name, product.description, product.category, ...product.colors, ...product.sizes]
        .join(' ')
        .toLowerCase()
        .includes(query)
      return matchesCategory && matchesSearch
    })
  }, [products, search, category])

  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length
  const revenue = sales.reduce((total, sale) => total + Number(sale.unit_price) * sale.quantity, 0)
  const categoryOptions = ['All', ...new Set([...categories, ...products.map((product) => product.category)])]

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return notify('Add your Supabase URL and publishable key to .env.local first.', true)
    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) {
      notify(error.message, true)
      setBusy(false)
      return
    }
    const { data: access, error: accessError } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle()
    if (accessError || !access) {
      await supabase.auth.signOut()
      setIsAdmin(false)
      notify(accessError ? `Could not verify store access: ${accessError.message}` : 'This account is not authorized to manage the store.', true)
      setBusy(false)
      return
    }
    setSession(data.session)
    setIsAdmin(true)
    setLoginPassword('')
    setAdminTab('dashboard')
    notify('Welcome back. Your store is ready.')
    setBusy(false)
  }

  async function handleLogout() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) return notify(`Could not sign out: ${error.message}`, true)
    setSession(null)
    setIsAdmin(false)
    setScreen('store')
    notify('You have been signed out.')
  }

  async function saveProduct(draft: ProductDraft, product?: Product) {
    if (!supabase || !session) return notify('Connect Supabase and sign in as an admin to manage products.', true)
    setBusy(true)
    let uploadedPath: string | null = null
    try {
      let imageUrl = draft.removeImage ? null : product?.image_url ?? null
      let imagePath = draft.removeImage ? null : product?.image_path ?? null
      if (draft.imageFile) {
        const safeName = draft.imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        uploadedPath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(uploadedPath, draft.imageFile, { upsert: false })
        if (uploadError) throw uploadError
        imagePath = uploadedPath
        imageUrl = supabase.storage.from('product-images').getPublicUrl(uploadedPath).data.publicUrl
      }

      const productData = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category,
        price: Number(draft.price),
        sizes: draft.sizes.split(',').map((item) => item.trim()).filter(Boolean),
        colors: draft.colors.split(',').map((item) => item.trim()).filter(Boolean),
        stock: Number(draft.stock),
        image_url: imageUrl,
        image_path: imagePath,
        updated_at: new Date().toISOString(),
      }

      const result = product
        ? await supabase.from('products').update(productData).eq('id', product.id).select().single()
        : await supabase.from('products').insert(productData).select().single()
      if (result.error) throw result.error

      if (product?.image_path && product.image_path !== imagePath) {
        const { error: removeError } = await supabase.storage.from('product-images').remove([product.image_path])
        if (removeError) notify(`Product saved, but the previous image could not be removed: ${removeError.message}`, true)
        else notify(product ? 'Product changes saved.' : 'Product added to your store.')
      } else {
        notify(product ? 'Product changes saved.' : 'Product added to your store.')
      }
      await loadProducts()
      setEditingProduct(null)
      setAdminTab('products')
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('product-images').remove([uploadedPath])
        if (cleanupError) console.error('Could not clean up an unused product image:', cleanupError.message)
      }
      notify(`Could not save product: ${errorMessage(error)}`, true)
    } finally {
      setBusy(false)
    }
  }

  async function deleteProduct(product: Product) {
    if (!supabase || !window.confirm(`Delete “${product.name}” from the store?`)) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (error) {
      notify(`Could not delete product: ${error.message}`, true)
      setBusy(false)
      return
    }
    if (product.image_path) {
      const { error: imageError } = await supabase.storage.from('product-images').remove([product.image_path])
      if (imageError) notify(`Product deleted, but its image could not be removed: ${imageError.message}`, true)
      else notify('Product deleted.')
    } else notify('Product deleted.')
    await loadProducts()
    setBusy(false)
  }

  async function recordSale(product: Product) {
    if (!supabase) return
    if (product.stock < 1) return notify('This product is out of stock. Restock it before recording a sale.', true)
    setBusy(true)
    const { error } = await supabase.rpc('record_product_sale', { product_id: product.id })
    if (error) notify(`Could not record sale: ${error.message}`, true)
    else {
      notify(`Sale recorded for ${product.name}.`)
      await Promise.all([loadProducts(), loadSales()])
    }
    setBusy(false)
  }

  function openAdmin(tab: AdminTab = 'dashboard') {
    setScreen('admin')
    setAdminTab(tab)
  }

  return (
    <div className="app-shell">
      {notice && (
        <div className={`notice ${notice.error ? 'notice-error' : ''}`} role="status">
          {notice.error ? <CircleAlert size={16} /> : <Check size={16} />}
          <span>{notice.text}</span>
          <button className="notice-close" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

      {screen === 'store' ? (
        <Storefront
          products={visibleProducts}
          totalProducts={products.length}
          loading={loading}
          search={search}
          category={category}
          categories={categoryOptions}
          onSearch={setSearch}
          onCategory={setCategory}
          onSelect={setSelectedProduct}
          onAdmin={() => openAdmin()}
          isConfigured={Boolean(supabase)}
        />
      ) : isAdmin ? (
        <AdminDashboard
          products={products}
          sales={sales}
          activeTab={adminTab}
          busy={busy}
          email={session?.user.email ?? ''}
          lowStockCount={lowStockCount}
          revenue={revenue}
          onTab={openAdmin}
          onStore={() => setScreen('store')}
          onLogout={handleLogout}
          onAdd={() => { setEditingProduct(null); setAdminTab('add') }}
          onEdit={(product) => { setEditingProduct(product); setAdminTab('add') }}
          onDelete={deleteProduct}
          onSell={recordSale}
          onSave={saveProduct}
          editingProduct={editingProduct}
          onRefresh={() => { void loadProducts(); void loadSales() }}
          onNotice={notify}
        />
      ) : (
        <AdminLogin
          email={loginEmail}
          password={loginPassword}
          busy={busy}
          configured={Boolean(supabase)}
          onEmail={setLoginEmail}
          onPassword={setLoginPassword}
          onSubmit={handleLogin}
          onStore={() => setScreen('store')}
          signedIn={Boolean(session)}
          onLogout={handleLogout}
        />
      )}

      {selectedProduct && (
        <ProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  )
}

function Storefront({
  products,
  totalProducts,
  loading,
  search,
  category,
  categories: categoryOptions,
  onSearch,
  onCategory,
  onSelect,
  onAdmin,
  isConfigured,
}: {
  products: Product[]
  totalProducts: number
  loading: boolean
  search: string
  category: string
  categories: string[]
  onSearch: (value: string) => void
  onCategory: (value: string) => void
  onSelect: (product: Product) => void
  onAdmin: () => void
  isConfigured: boolean
}) {
  const featuredCount = products.filter((product) => product.stock > 0).length

  return (
    <div className="storefront">
      <div className="announcement"><Sparkles size={13} /> Thoughtfully made. Worn on repeat. <span>Fewer pieces. More stories.</span></div>
      <header className="store-header">
        <button className="wordmark" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); onCategory('All'); onSearch('') }} aria-label="Alyssa Thrift Store home">
          <span className="brand-icon"><span /><span /><span /></span>
          <span>ALYSSA <span className="wordmark-secondary">THRIFT STORE</span></span>
        </button>
        <nav className="store-nav" aria-label="Main navigation">
          <a href="#collection">Shop collection</a>
          <a href="#story">Our approach</a>
        </nav>
        <div className="header-actions">
          <a href="#collection" className="header-shop-link">Explore pieces <ArrowRight size={14} /></a>
        </div>
      </header>

      {!isConfigured && <div className="setup-notice"><Cloud size={17} /> Connect your Supabase project to publish the live collection. See <code>.env.example</code> and the setup guide.</div>}

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> A MORE CONSIDERED WARDROBE</div>
            <h1>Wear what<br /><em>moves you.</em></h1>
            <p>Everyday essentials, made to last. Thoughtful silhouettes, honest materials, and pieces that feel like you.</p>
            <a className="button button-dark hero-button" href="#collection">Discover the collection <ArrowRight size={16} /></a>
            <div className="hero-proof"><span className="proof-dots"><i /><i /><i /></span><span>{totalProducts ? `${totalProducts} considered pieces` : 'New collection, coming to life'}</span><span className="proof-divider" /> Designed for everyday</div>
          </div>
          <div className="hero-image-wrap">
            <div className="hero-image">
              <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=85" alt="Friends shopping for contemporary everyday clothing" />
              <div className="image-label"><span>THE EVERYDAY EDIT</span><strong>Ease, in every layer.</strong></div>
            </div>
            <div className="hero-sticker"><span>LESS,</span><span>BUT</span><span>BETTER.</span><ArrowDownRight size={19} /></div>
            <div className="hero-caption">01 / THE NEW SEASON</div>
          </div>
          <div className="hero-index">THOUGHTFULLY MADE <span>—</span> ALWAYS</div>
        </section>

        <section className="values-strip" id="story">
          <div><span className="value-icon"><Sparkles size={17} /></span><span><strong>Made with intention</strong><small>Considered in every detail</small></span></div>
          <div><span className="value-icon"><Package size={17} /></span><span><strong>Fewer, better things</strong><small>Pieces worth keeping</small></span></div>
          <div><span className="value-icon"><TrendingUp size={17} /></span><span><strong>Made for real life</strong><small>Comfort meets character</small></span></div>
        </section>

        <section className="collection-section" id="collection">
          <div className="section-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> A LITTLE SOMETHING FOR EVERY DAY</div><h2>The collection<span className="section-period">.</span></h2></div>
            <p>Thoughtful staples. A little less ordinary.<br />A lot more you.</p>
          </div>
          <div className="collection-toolbar">
            <div className="category-list" aria-label="Filter by category">
              {categoryOptions.map((item) => (
                <button key={item} className={`category-chip ${category === item ? 'category-chip-active' : ''}`} onClick={() => onCategory(item)}>{item}</button>
              ))}
            </div>
            <label className="search-field">
              <Search size={16} />
              <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Find your new favorite" aria-label="Search products" />
              {search && <button aria-label="Clear search" onClick={() => onSearch('')}><X size={14} /></button>}
            </label>
          </div>
          <div className="collection-count"><span>{loading ? 'Loading the collection…' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`}</span><span><span className="available-dot" /> {featuredCount} available</span></div>

          {!isConfigured ? (
            <EmptyCollection icon={Cloud} title="Your store is almost ready" detail="Connect Supabase to load your live products here. No sample products are shown." />
          ) : loading ? (
            <div className="loading-grid">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-card"><div /><span /><small /></div>)}</div>
          ) : products.length ? (
            <div className="product-grid">
              {products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onClick={() => onSelect(product)} />)}
            </div>
          ) : (
            <EmptyCollection icon={ShoppingBag} title={search || category !== 'All' ? 'No pieces found' : 'A fresh start.'} detail={search || category !== 'All' ? 'Try another search or category.' : 'The collection is being curated. Check back soon for considered pieces made to be worn on repeat.'} />
          )}
        </section>

        <section className="editorial-banner">
          <div className="editorial-image"><img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1500&q=85" alt="Contemporary neutral-toned fashion styling" loading="lazy" /></div>
          <div className="editorial-copy"><div className="eyebrow"><span className="eyebrow-line" /> A THOUGHTFUL WAY TO GET DRESSED</div><h2>Good clothes.<br /><em>Good feeling.</em></h2><p>We believe getting dressed should feel less like a decision and more like coming home to yourself.</p><a href="#collection" className="text-link">Find your everyday <ArrowRight size={15} /></a><span className="editorial-number">02 / 03</span></div>
        </section>
      </main>

      <footer className="store-footer">
        <div className="footer-main">
          <div><a className="wordmark footer-brand" href="#"><span className="brand-icon"><span /><span /><span /></span><span>ALYSSA <span className="wordmark-secondary">THRIFT STORE</span></span></a><p>Good things, thoughtfully worn.</p></div>
          <div className="footer-note"><span>OUR APPROACH</span><span>Fewer pieces. More thoughtful choices.</span></div>
          <div className="footer-note"><span>A GOOD REMINDER</span><span>Dress like yourself.</span></div>
          <button className="admin-entry" onClick={onAdmin}>Store owner <ArrowRight size={14} /></button>
        </div>
        <div className="footer-bottom"><span>© {pageLoadedAt.getFullYear()} Alyssa Thrift Store</span><span>Made with a little more intention.</span><span>Clothes you'll come back to.</span></div>
      </footer>
    </div>
  )
}

function ProductCard({ product, index, onClick }: { product: Product; index: number; onClick: () => void }) {
  return (
    <button className="product-card" onClick={onClick} style={{ animationDelay: `${index * 55}ms` }}>
      <div className="product-image">
        {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <div className="product-image-placeholder"><Shirt size={36} strokeWidth={1} /><span>IMAGE COMING SOON</span></div>}
        <span className="product-category-label">{product.category}</span>
        {product.stock === 0 && <span className="sold-badge">SOLD OUT</span>}
        {product.stock > 0 && product.stock <= 3 && <span className="few-badge">ONLY {product.stock} LEFT</span>}
        <span className="product-quick-view">View piece <ArrowRight size={14} /></span>
      </div>
      <div className="product-card-info"><div><h3>{product.name}</h3><span>{product.colors.length ? product.colors.join(' · ') : product.category}</span><span>{product.stock > 0 ? `${product.stock} in stock` : 'Sold out'}</span></div><strong>{formatMoney(Number(product.price))}</strong></div>
    </button>
  )
}

function EmptyCollection({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="empty-collection"><span className="empty-icon"><Icon size={22} /></span><h3>{title}</h3><p>{detail}</p></div>
}

function ProductDetails({ product, onClose }: { product: Product; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-name">
        <button className="modal-close" onClick={onClose} aria-label="Close product details"><X size={20} /></button>
        <div className="detail-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="product-image-placeholder"><Shirt size={44} strokeWidth={1} /><span>IMAGE COMING SOON</span></div>}</div>
        <div className="detail-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> {product.category.toUpperCase()}</div>
          <h2 id="product-detail-name">{product.name}</h2><div className="detail-price">{formatMoney(Number(product.price))}</div>
          <p className="detail-description">{product.description || 'A considered everyday piece, thoughtfully chosen for comfort and made to be worn on repeat.'}</p>
          <div className="detail-meta"><span>COLOUR</span><strong>{product.colors.length ? product.colors.join(', ') : '—'}</strong></div>
          <div className="detail-meta"><span>SIZES</span><strong>{product.sizes.length ? product.sizes.join(' · ') : 'One size'}</strong></div>
          <div className="detail-stock">{product.stock > 0 ? <><span className="available-dot" /> In stock · {product.stock} available</> : <><span className="sold-indicator" /> Sold out</>}</div>
        </div>
      </section>
    </div>
  )
}

function AdminLogin({
  email,
  password,
  busy,
  configured,
  onEmail,
  onPassword,
  onSubmit,
  onStore,
  signedIn,
  onLogout,
}: {
  email: string
  password: string
  busy: boolean
  configured: boolean
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onStore: () => void
  signedIn: boolean
  onLogout: () => void
}) {
  return (
    <div className="login-page">
      <header className="login-header"><button className="wordmark" onClick={onStore}><span className="brand-icon"><span /><span /><span /></span><span>ALYSSA <span className="wordmark-secondary">THRIFT STORE</span></span></button><button className="back-store" onClick={onStore}><ArrowLeft size={15} /> Back to store</button></header>
      <div className="login-layout">
        <div className="login-art"><img src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=85" alt="A thoughtfully styled wardrobe in warm natural light" /><div className="login-art-overlay"><span>THE GOOD THINGS, EDIT</span><strong>Thoughtfully worn.<br /><em>Beautifully yours.</em></strong></div></div>
        <div className="login-form-wrap"><div className="login-mark"><span className="brand-icon"><span /><span /><span /></span><span className="eyebrow">THE OWNER'S STUDIO</span></div><h1>Welcome<br />back<span>.</span></h1><p className="login-intro">Sign in to tend to your collection.</p>
          {!configured && <div className="form-alert"><Cloud size={16} /> Configure Supabase in <code>.env.local</code> before signing in.</div>}
          {signedIn && <div className="form-alert"><CircleAlert size={16} /> This account does not have store owner access.{<button type="button" onClick={onLogout}>Sign out</button>}</div>}
          <form onSubmit={onSubmit} className="login-form">
            <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => onEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => onPassword(event.target.value)} placeholder="Your password" /></label>
            <button type="submit" className="button button-dark login-submit" disabled={busy || !configured}>{busy ? 'Signing in…' : 'Sign in to your studio'} <ArrowRight size={16} /></button>
          </form>
          <p className="login-security"><span className="secure-dot" /> Secure access for authorized store owners only.</p>
        </div>
      </div>
      <div className="login-footer"><span>© {pageLoadedAt.getFullYear()} Alyssa Thrift Store</span><span>Fewer, better things. Always.</span></div>
    </div>
  )
}

const sidebarGroups: { title: string; items: { id: AdminTab; label: string; icon: LucideIcon }[] }[] = [
  { title: 'OVERVIEW', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'YOUR STORE', items: [{ id: 'products', label: 'Products', icon: Package }, { id: 'add', label: 'Add product', icon: Plus }, { id: 'sold', label: 'Sold products', icon: Tag }, { id: 'inventory', label: 'Inventory', icon: ClipboardList }] },
  { title: 'INSIGHTS', items: [{ id: 'sales', label: 'Sales history', icon: BarChart3 }] },
  { title: 'PREFERENCES', items: [{ id: 'settings', label: 'Settings', icon: Settings }] },
]

function AdminDashboard({
  products,
  sales,
  activeTab,
  busy,
  email,
  lowStockCount,
  revenue,
  onTab,
  onStore,
  onLogout,
  onAdd,
  onEdit,
  onDelete,
  onSell,
  onSave,
  editingProduct,
  onRefresh,
  onNotice,
}: {
  products: Product[]
  sales: Sale[]
  activeTab: AdminTab
  busy: boolean
  email: string
  lowStockCount: number
  revenue: number
  onTab: (tab: AdminTab) => void
  onStore: () => void
  onLogout: () => void
  onAdd: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onSell: (product: Product) => void
  onSave: (draft: ProductDraft, product?: Product) => Promise<void>
  editingProduct: Product | null
  onRefresh: () => void
  onNotice: (text: string, error?: boolean) => void
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const available = products.filter((product) => product.stock > 0).length
  const soldOut = products.filter((product) => product.stock === 0).length
  const pageTitle = sidebarGroups.flatMap((group) => group.items).find((item) => item.id === activeTab)?.label ?? 'Dashboard'
  const filteredProducts = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(tableSearch.toLowerCase()))

  function navigate(tab: AdminTab) {
    if (tab === 'add') onAdd()
    else onTab(tab)
    setSidebarOpen(false)
  }

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <button className="admin-brand" onClick={onStore}><span className="brand-icon"><span /><span /><span /></span><span>ALYSSA THRIFT STORE<small>THE OWNER'S STUDIO</small></span></button>
        <button className="store-switcher" onClick={onStore}><span className="store-switch-icon">A</span><span><strong>Alyssa Thrift Store</strong><small>View live storefront</small></span><ArrowUpRight size={15} /></button>
        <nav className="admin-nav" aria-label="Admin navigation">
          {sidebarGroups.map((group) => <div className="nav-group" key={group.title}><span className="nav-group-title">{group.title}</span>{group.items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${activeTab === id ? 'nav-item-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'inventory' && lowStockCount > 0 && <span className="nav-count">{lowStockCount}</span>}</button>)}</div>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-user"><span className="avatar">{email.charAt(0).toUpperCase() || 'T'}</span><span><strong>{email.split('@')[0]}</strong><small>Store owner</small></span><button aria-label="Sign out" onClick={onLogout}><LogOut size={16} /></button></div><div className="sidebar-version"><span className="online-indicator" /> Your store is live</div></div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <div className="admin-main">
        <header className="admin-topbar"><div className="admin-topbar-left"><button className="mobile-menu admin-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumb"><span>Studio</span><span>/</span><strong>{pageTitle}</strong></div></div><div className="admin-topbar-actions"><span className="admin-date"><Clock3 size={14} /> {new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(pageLoadedAt)}</span><button className="avatar topbar-avatar" aria-label={`Signed in as ${email}`}>{email.charAt(0).toUpperCase()}</button></div></header>
        <main className="admin-content">
          {activeTab === 'add' ? <ProductForm key={editingProduct?.id ?? 'new'} product={editingProduct} busy={busy} onSave={onSave} onCancel={() => onTab('products')} /> :
            activeTab === 'settings' ? <SettingsPage email={email} onNotice={onNotice} /> :
              activeTab === 'sales' ? <SalesPage sales={sales} revenue={revenue} /> :
                activeTab === 'inventory' ? <InventoryPage products={products} onEdit={onEdit} onSell={onSell} busy={busy} /> :
                  activeTab === 'sold' ? <ProductsPage title="Sold products" description="A record of pieces that have found their person." products={products.filter((product) => product.status === 'sold_out' && `${product.name} ${product.category}`.toLowerCase().includes(tableSearch.toLowerCase()))} sales={sales} tableSearch={tableSearch} onSearch={setTableSearch} onEdit={onEdit} onDelete={onDelete} onSell={onSell} busy={busy} soldMode /> :
                    activeTab === 'products' ? <ProductsPage title="Your products" description="Every piece in your collection, all in one place." products={filteredProducts} sales={sales} tableSearch={tableSearch} onSearch={setTableSearch} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onSell={onSell} busy={busy} /> :
                      <DashboardOverview products={products} sales={sales} revenue={revenue} available={available} soldOut={soldOut} lowStock={lowStockCount} onNavigate={navigate} onAdd={onAdd} onEdit={onEdit} onRefresh={onRefresh} />}
        </main>
      </div>
    </div>
  )
}

function DashboardOverview({
  products,
  sales,
  revenue,
  available,
  soldOut,
  lowStock,
  onNavigate,
  onAdd,
  onEdit,
  onRefresh,
}: {
  products: Product[]
  sales: Sale[]
  revenue: number
  available: number
  soldOut: number
  lowStock: number
  onNavigate: (tab: AdminTab) => void
  onAdd: () => void
  onEdit: (product: Product) => void
  onRefresh: () => void
}) {
  const recentSales = sales.slice(0, 5)

  return (
    <div className="dashboard-page">
      <div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR STORE, AT A GLANCE</div><h1>Good morning<span className="section-period">.</span></h1><p>A little overview of how things are going.</p></div><div className="heading-actions"><button className="button button-light" onClick={onRefresh}><TrendingUp size={15} /> Refresh</button><button className="button button-dark" onClick={onAdd}><Plus size={16} /> Add a product</button></div></div>
      <div className="stats-grid">
        <StatCard label="Total products" value={products.length.toString()} note={`${products.length === 1 ? 'piece' : 'pieces'} in your collection`} icon={Package} accent="cream" />
        <StatCard label="Available" value={available.toString()} note={lowStock ? `${lowStock} running low on stock` : 'Ready to find their person'} icon={ShoppingBag} accent="sage" />
        <StatCard label="Sold out" value={soldOut.toString()} note="Pieces fully claimed" icon={Tag} accent="rose" />
        <StatCard label="Sales revenue" value={formatMoney(revenue)} note={`${sales.length} recorded ${sales.length === 1 ? 'sale' : 'sales'}`} icon={TrendingUp} accent="lavender" />
      </div>
      <div className="dashboard-columns">
        <section className="dashboard-panel inventory-panel"><div className="panel-heading"><div><h2>Inventory snapshot</h2><p>Here's what's on your shelves.</p></div><button className="panel-link" onClick={() => onNavigate('inventory')}>Full inventory <ArrowRight size={14} /></button></div>
          {products.length ? <div className="snapshot-list">{products.slice(0, 5).map((product) => <div className="snapshot-row" key={product.id}><ProductThumb product={product} /><span className="snapshot-name"><strong>{product.name}</strong><small>{product.category}</small></span><span className={`stock-label ${product.stock === 0 ? 'stock-out' : product.stock <= 3 ? 'stock-low' : 'stock-ok'}`}><i />{product.stock === 0 ? 'Sold out' : product.stock <= 3 ? `${product.stock} left` : 'In stock'}</span><strong className="snapshot-price">{formatMoney(Number(product.price))}</strong><button className="row-edit" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`}><ArrowUpRight size={15} /></button></div>)}</div> : <div className="panel-empty"><Package size={20} /><span>Your product list is ready for its first piece.</span><button onClick={onAdd}>Add a product <ArrowRight size={14} /></button></div>}
          {products.length > 5 && <button className="panel-bottom-link" onClick={() => onNavigate('products')}>See all {products.length} products <ArrowRight size={14} /></button>}
        </section>
        <section className="dashboard-panel sales-panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Pieces finding their new homes.</p></div><button className="panel-link" onClick={() => onNavigate('sales')}>View history <ArrowRight size={14} /></button></div>
          {recentSales.length ? <div className="recent-sales-list">{recentSales.map((sale) => <div className="sale-row" key={sale.id}><span className="sale-symbol"><Check size={15} /></span><span className="sale-product"><strong>{sale.product_name}</strong><small>{formatDate(sale.sold_at)}</small></span><strong>{formatMoney(Number(sale.unit_price) * sale.quantity)}</strong></div>)}</div> : <div className="panel-empty"><BarChart3 size={20} /><span>Your sales will appear here once recorded.</span></div>}
          <div className="sales-total"><span>Total recorded revenue</span><strong>{formatMoney(revenue)}</strong><span className="sales-total-note">From {sales.length} recorded {sales.length === 1 ? 'sale' : 'sales'}</span></div>
        </section>
      </div>
      <section className="dashboard-callout"><span className="callout-icon"><Sparkles size={18} /></span><span><strong>A note on inventory</strong><small>Stock of three or fewer pieces is flagged so you can restock before the last one goes.</small></span><button onClick={() => onNavigate('inventory')}>Check stock <ArrowRight size={14} /></button></section>
    </div>
  )
}

function StatCard({ label, value, note, icon: Icon, accent }: { label: string; value: string; note: string; icon: LucideIcon; accent: string }) {
  return <div className="stat-card"><div className={`stat-icon stat-${accent}`}><Icon size={17} strokeWidth={1.8} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>
}

function ProductsPage({
  title,
  description,
  products,
  sales,
  tableSearch,
  onSearch,
  onAdd,
  onEdit,
  onDelete,
  onSell,
  busy,
  soldMode = false,
}: {
  title: string
  description: string
  products: Product[]
  sales: Sale[]
  tableSearch: string
  onSearch: (value: string) => void
  onAdd?: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onSell: (product: Product) => void
  busy: boolean
  soldMode?: boolean
}) {
  return (
    <div className="admin-list-page">
      <div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {soldMode ? 'A LOOK BACK AT THE PIECES THAT SOLD' : 'YOUR COLLECTION, ALL IN ONE PLACE'}</div><h1>{title}<span className="section-period">.</span></h1><p>{description}</p></div>{onAdd && <button className="button button-dark" onClick={onAdd}><Plus size={16} /> Add a product</button>}</div>
      <div className="list-toolbar"><label className="admin-search"><Search size={16} /><input value={tableSearch} onChange={(event) => onSearch(event.target.value)} placeholder="Search products" /></label><div className="list-toolbar-end"><span className="table-count">{products.length} {products.length === 1 ? 'product' : 'products'}</span></div></div>
      {products.length ? <ProductTable products={products} sales={sales} onEdit={onEdit} onDelete={onDelete} onSell={onSell} busy={busy} soldMode={soldMode} /> : <div className="admin-empty"><span className="empty-icon"><Package size={21} /></span><h3>{soldMode ? 'No sold-out pieces just yet.' : 'It starts with one good thing.'}</h3><p>{soldMode ? 'Products with no remaining stock will show up here.' : 'Add your first product and start building your collection.'}</p>{onAdd && <button className="button button-dark" onClick={onAdd}><Plus size={15} /> Add a product</button>}</div>}
    </div>
  )
}

function ProductTable({ products, sales, onEdit, onDelete, onSell, busy, soldMode = false, allowDelete = true }: { products: Product[]; sales: Sale[]; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onSell: (product: Product) => void; busy: boolean; soldMode?: boolean; allowDelete?: boolean }) {
  const latestSale = new Map<string, Sale>()
  for (const sale of sales) if (sale.product_id && !latestSale.has(sale.product_id)) latestSale.set(sale.product_id, sale)
  return (
    <div className="table-wrap"><table className="products-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th>{soldMode && <th>LAST SOLD</th>}<th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {products.map((product) => <tr key={product.id}><td><div className="table-product"><ProductThumb product={product} /><span><strong>{product.name}</strong><small>{product.colors.length ? product.colors.join(' · ') : 'No colour options'}</small></span></div></td><td><span className="category-tag">{product.category}</span></td><td className="table-price">{formatMoney(Number(product.price))}</td><td><span className={`stock-value ${product.stock === 0 ? 'stock-value-zero' : product.stock <= 3 ? 'stock-value-low' : ''}`}>{product.stock}<small> units</small></span></td>{soldMode && <td className="table-muted">{latestSale.get(product.id) ? formatDate(latestSale.get(product.id)!.sold_at) : '—'}</td>}<td><span className={`status-pill ${product.stock === 0 ? 'status-sold' : product.stock <= 3 ? 'status-low' : 'status-available'}`}><i />{product.stock === 0 ? 'Sold out' : product.stock <= 3 ? 'Low stock' : 'Available'}</span></td><td><div className="table-actions">{product.stock > 0 && <button className="action-button action-sell" onClick={() => onSell(product)} disabled={busy} title="Record a sale and reduce stock by one"><Check size={14} /><span>Record sale</span></button>}<button className="action-icon" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} title="Edit"><Settings size={15} /></button>{allowDelete && <button className="action-icon action-delete" onClick={() => onDelete(product)} disabled={busy} aria-label={`Delete ${product.name}`} title="Delete"><X size={15} /></button>}</div></td></tr>)}
    </tbody></table></div>
  )
}

function ProductThumb({ product }: { product: Product }) {
  return <span className="table-thumb">{product.image_url ? <img src={product.image_url} alt="" /> : <Shirt size={17} strokeWidth={1.2} />}</span>
}

function InventoryPage({ products, onEdit, onSell, busy }: { products: Product[]; onEdit: (product: Product) => void; onSell: (product: Product) => void; busy: boolean }) {
  const low = products.filter((product) => product.stock > 0 && product.stock <= 3)
  const out = products.filter((product) => product.stock === 0)
  const healthy = products.filter((product) => product.stock > 3)
  return (
    <div className="admin-list-page"><div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> KEEP A GOOD EYE ON YOUR STOCK</div><h1>Inventory<span className="section-period">.</span></h1><p>Stock levels update automatically whenever you record a sale.</p></div></div>
      <div className="inventory-stats"><StatCard label="In stock" value={healthy.length.toString()} note="More than 3 pieces on hand" icon={Package} accent="sage" /><StatCard label="Running low" value={low.length.toString()} note="Three or fewer remaining" icon={ArrowDownRight} accent="cream" /><StatCard label="Sold out" value={out.length.toString()} note="Ready to restock if you like" icon={Tag} accent="rose" /></div>
      {low.length > 0 && <section className="inventory-alert"><span><CircleAlert size={17} /></span><div><strong>{low.length} {low.length === 1 ? 'piece is' : 'pieces are'} running low</strong><p>These are down to three or fewer. Edit a product to add more stock.</p></div></section>}
      {products.length ? <ProductTable products={[...low, ...out, ...healthy]} sales={[]} onEdit={onEdit} onDelete={() => undefined} onSell={onSell} busy={busy} allowDelete={false} /> : <div className="admin-empty"><Package size={22} /><h3>No stock to track yet.</h3><p>Products you add will appear here.</p></div>}
    </div>
  )
}

function SalesPage({ sales, revenue }: { sales: Sale[]; revenue: number }) {
  return (
    <div className="admin-list-page"><div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EVERY PIECE HAS A STORY</div><h1>Sales history<span className="section-period">.</span></h1><p>A record of the pieces that have found their person.</p></div></div>
      <div className="sales-summary"><span className="sales-summary-icon"><TrendingUp size={18} /></span><span><small>TOTAL RECORDED REVENUE</small><strong>{formatMoney(revenue)}</strong></span><span className="sales-summary-count">{sales.length} recorded {sales.length === 1 ? 'sale' : 'sales'}</span></div>
      {sales.length ? <div className="table-wrap"><table className="products-table sales-table"><thead><tr><th>PIECE</th><th>DATE SOLD</th><th>QUANTITY</th><th>UNIT PRICE</th><th>TOTAL</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><div className="table-product"><span className="sale-symbol"><Check size={15} /></span><span><strong>{sale.product_name}</strong><small>Sale recorded</small></span></div></td><td className="table-muted">{formatDate(sale.sold_at)}</td><td>{sale.quantity}</td><td className="table-price">{formatMoney(Number(sale.unit_price))}</td><td className="table-price">{formatMoney(Number(sale.unit_price) * sale.quantity)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><span className="empty-icon"><BarChart3 size={21} /></span><h3>Your next chapter starts here.</h3><p>When you record a sale, the product and its sale date will appear here.</p></div>}
    </div>
  )
}

function ProductForm({ product, busy, onSave, onCancel }: { product: Product | null; busy: boolean; onSave: (draft: ProductDraft, product?: Product) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<ProductDraft>(product ? {
    name: product.name,
    description: product.description,
    category: product.category,
    price: String(product.price),
    sizes: product.sizes.join(', '),
    colors: product.colors.join(', '),
    stock: String(product.stock),
    imageFile: null,
    removeImage: false,
  } : emptyDraft)
  const [imagePreview, setImagePreview] = useState(product?.image_url ?? null)
  const [validationError, setValidationError] = useState('')

  useEffect(() => () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const price = Number(draft.price)
    const stock = Number(draft.stock)
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setValidationError('Enter a valid non-negative price and whole-number stock quantity.')
      return
    }
    setValidationError('')
    void onSave(draft, product ?? undefined)
  }

  return (
    <div className="product-form-page"><button className="form-back" onClick={onCancel}><ArrowLeft size={15} /> Back to products</button><div className="admin-page-heading form-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {product ? 'A LITTLE UPDATE' : 'A NEW PIECE FOR YOUR COLLECTION'}</div><h1>{product ? 'Edit product' : 'Add a product'}<span className="section-period">.</span></h1><p>{product ? 'Make a thoughtful change to this piece.' : 'Every good collection starts somewhere.'}</p></div></div>
      <form className="product-editor-form" onSubmit={submit}>
        <div className="editor-main"><section className="editor-card"><div className="editor-card-heading"><span className="editor-step">01</span><div><h2>The essentials</h2><p>Give your product the details it deserves.</p></div></div>
          <label className="form-label">Product name <span>*</span><input required maxLength={120} value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. The Everyday Oxford" /></label>
          <label className="form-label">Description<textarea rows={4} maxLength={2000} value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="What makes this piece feel special?" /></label>
          <div className="form-row"><label className="form-label">Category <span>*</span><span className="select-wrap"><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></span></label><label className="form-label">Price (USD) <span>*</span><span className="input-prefix"><span>$</span><input required min="0" step="0.01" type="number" value={draft.price} onChange={(event) => update('price', event.target.value)} placeholder="0.00" /></span></label></div>
        </section>
          <section className="editor-card"><div className="editor-card-heading"><span className="editor-step">02</span><div><h2>Size, colour & stock</h2><p>Keep your inventory details up to date.</p></div></div>
            <div className="form-row"><label className="form-label">Sizes<span className="field-note">Separate with commas</span><input value={draft.sizes} onChange={(event) => update('sizes', event.target.value)} placeholder="XS, S, M, L, XL" /></label><label className="form-label">Colours<span className="field-note">Separate with commas</span><input value={draft.colors} onChange={(event) => update('colors', event.target.value)} placeholder="Ecru, Olive, Ink" /></label></div>
            <label className="form-label stock-input-label">Stock quantity <span>*</span><span className="field-note">Set to 0 to mark this product sold out.</span><input required min="0" step="1" type="number" value={draft.stock} onChange={(event) => update('stock', event.target.value)} /></label>
          </section>
          {validationError && <p className="form-error"><CircleAlert size={15} /> {validationError}</p>}
          <div className="form-actions"><button type="button" className="button button-light" onClick={onCancel}>Cancel</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'} <ArrowRight size={15} /></button></div>
        </div>
        <aside className="editor-side"><section className="editor-card image-editor-card"><div className="editor-card-heading"><span className="editor-step">03</span><div><h2>Product image</h2><p>A picture says a little more.</p></div></div>
          <label className="image-upload" htmlFor="product-image"><input id="product-image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 5 * 1024 * 1024) { setValidationError('Choose an image smaller than 5 MB.'); event.target.value = ''; return } update('imageFile', file); if (file) { update('removeImage', false); setImagePreview(URL.createObjectURL(file)) } }} />{imagePreview ? <img src={imagePreview} alt="Product preview" /> : <span className="upload-prompt"><FileImage size={26} strokeWidth={1.3} /><strong>Choose an image</strong><small>JPG, PNG, WebP · Up to 5 MB</small></span>}<span className="upload-overlay">{imagePreview ? 'Change image' : 'Browse files'}</span></label>
          {imagePreview && <button type="button" className="remove-image" onClick={() => { update('imageFile', null); update('removeImage', true); setImagePreview(null) }}>Remove image</button>}
          <p className="image-help">A clean, well-lit photograph helps your piece find its person. Images are stored securely in your Supabase project.</p>
        </section><div className="editor-tip"><Sparkles size={16} /><span><strong>A little tip</strong><small>Products with a clear name, description, sizes and stock details are easier to discover.</small></span></div></aside>
      </form>
    </div>
  )
}

function SettingsPage({ email, onNotice }: { email: string; onNotice: (text: string, error?: boolean) => void }) {
  return (
    <div className="admin-list-page"><div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR STORE, YOUR WAY</div><h1>Settings<span className="section-period">.</span></h1><p>A few details about your store and account.</p></div></div><div className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Settings size={17} /></span><div><h2>Store profile</h2><p>Your storefront basics.</p></div></div><div className="settings-row"><span><strong>Store name</strong><small>The name displayed on your storefront.</small></span><strong>Alyssa Thrift Store</strong></div><div className="settings-row"><span><strong>Store currency</strong><small>Used for product prices and sales reporting.</small></span><strong>USD · $</strong></div><div className="settings-row"><span><strong>Product images</strong><small>Securely hosted in Supabase Storage.</small></span><strong className="settings-connected"><span className="online-indicator" /> Connected</strong></div></div><div className="settings-card account-settings"><div className="settings-card-heading"><span className="settings-icon"><LogOut size={17} /></span><div><h2>Owner account</h2><p>Signed in securely with Supabase Authentication.</p></div></div><div className="settings-row"><span><strong>Signed in as</strong><small>Only authorized store owners can access this dashboard.</small></span><strong>{email}</strong></div><div className="settings-row"><span><strong>Access control</strong><small>Managed by your Supabase admin_users table and RLS policies.</small></span><strong className="settings-connected"><span className="online-indicator" /> Protected</strong></div></div><button className="button button-light migration-copy" onClick={async () => { try { await navigator.clipboard.writeText('supabase/migrations/202611240001_store.sql'); onNotice('Migration path copied to clipboard.') } catch { onNotice('Migration: supabase/migrations/202611240001_store.sql') } }}><ClipboardList size={15} /> Copy database migration path</button></div>
  )
}

export default App
